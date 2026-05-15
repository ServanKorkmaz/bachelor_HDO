import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAuditLog, AUDIT_ENTITY_TYPE, AUDIT_ACTION } from '@/lib/admin/audit'
import { withEvents } from '@/lib/notifications/events'
import { ServiceError } from './errors'

const swapInclude = {
  requestedBy: { select: { id: true, name: true } },
  fromUser: { select: { id: true, name: true } },
  toUser: { select: { id: true, name: true } },
  shift: { include: { shiftType: true } },
  toShift: { include: { shiftType: true } },
} satisfies Prisma.SwapRequestInclude

export type SwapWithRelations = Prisma.SwapRequestGetPayload<{ include: typeof swapInclude }>

export interface CreateSwapInput {
  teamId: string
  requestedByUserId: string
  shiftId: string
  toShiftId?: string | null
  toUserId: string
  message?: string | null
}

/**
 * Look up a swap request with the relations the service operations need, or
 * throw a typed 404. Callers can pass `requireStatus` to assert the request is
 * in a particular state before mutating it.
 */
async function loadSwap(id: string, requireStatus?: string, badStateMessage?: string) {
  const sr = await prisma.swapRequest.findUnique({
    where: { id },
    include: swapInclude,
  })
  if (!sr) {
    throw new ServiceError('SWAP_NOT_FOUND', 'Swap request not found', 404)
  }
  if (requireStatus && sr.status !== requireStatus) {
    throw new ServiceError(
      'SWAP_WRONG_STATE',
      badStateMessage ?? `Swap request is not ${requireStatus.toLowerCase()}`,
      400
    )
  }
  return sr
}

/**
 * Create a swap request. The shift is looked up to find its assignee
 * (`fromUserId`) — the caller is the requester, and the body's intended
 * recipient is `toUserId`. Notifies the recipient and writes one audit row.
 */
export async function createSwap(input: CreateSwapInput): Promise<SwapWithRelations> {
  const shift = await prisma.shift.findUnique({ where: { id: input.shiftId } })
  if (!shift) {
    throw new ServiceError('SHIFT_NOT_FOUND', 'Shift not found', 404)
  }

  return withEvents(async (tx, emit) => {
    const sr = await tx.swapRequest.create({
      data: {
        teamId: input.teamId,
        requestedByUserId: input.requestedByUserId,
        fromUserId: shift.userId,
        toUserId: input.toUserId,
        shiftId: input.shiftId,
        toShiftId: input.toShiftId || null,
        status: 'AWAITING_ACCEPTANCE',
        message: input.message || null,
      },
      include: swapInclude,
    })
    await emit({
      type: 'SWAP_REQUEST_SENT',
      teamId: input.teamId,
      toUserId: input.toUserId,
      requesterName: sr.requestedBy.name,
    })
    await createAuditLog(tx, {
      actorUserId: input.requestedByUserId,
      action: AUDIT_ACTION.SWAP_REQUESTED,
      entityType: AUDIT_ENTITY_TYPE.SWAP_REQUEST,
      entityId: sr.id,
      afterJson: JSON.stringify({
        fromUserId: sr.fromUserId,
        toUserId: sr.toUserId,
        shiftId: sr.shiftId,
        shiftDate: sr.shift.date,
      }),
    })
    return sr
  })
}

/**
 * Employee B accepts a swap that was AWAITING_ACCEPTANCE → moves to PENDING
 * (now waiting for leader approval). Caller must be the `toUser`.
 */
export async function acceptSwap(swapRequestId: string, actorUserId: string) {
  const sr = await loadSwap(
    swapRequestId,
    'AWAITING_ACCEPTANCE',
    'Forespørselen venter ikke på svar'
  )
  if (sr.toUserId !== actorUserId) {
    throw new ServiceError('SWAP_FORBIDDEN', 'Ikke autorisert', 403)
  }

  return withEvents(async (tx, emit) => {
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'PENDING' },
    })
    await emit({
      type: 'SWAP_ACCEPTED_BY_PARTNER',
      teamId: sr.teamId,
      requesterUserId: sr.requestedByUserId,
      partnerName: sr.toUser.name,
    })
    await emit({
      type: 'SWAP_READY_FOR_LEADER',
      teamId: sr.teamId,
      requesterName: sr.requestedBy.name,
      partnerName: sr.toUser.name,
    })
    return updated
  })
}

/** Employee B declines a swap that was AWAITING_ACCEPTANCE → moves to REJECTED. */
export async function declineSwap(swapRequestId: string, actorUserId: string) {
  const sr = await loadSwap(
    swapRequestId,
    'AWAITING_ACCEPTANCE',
    'Forespørselen venter ikke på svar'
  )
  if (sr.toUserId !== actorUserId) {
    throw new ServiceError('SWAP_FORBIDDEN', 'Ikke autorisert', 403)
  }

  return withEvents(async (tx, emit) => {
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'REJECTED', decidedBy: actorUserId, decidedAt: new Date() },
    })
    await emit({
      type: 'SWAP_DECLINED_BY_PARTNER',
      teamId: sr.teamId,
      requesterUserId: sr.requestedByUserId,
      partnerName: sr.toUser.name,
    })
    return updated
  })
}

/** Leader approves a PENDING swap and notifies the requester. */
export async function approveSwap(swapRequestId: string, actorUserId: string) {
  const sr = await loadSwap(swapRequestId, 'PENDING', 'Swap request is not pending')

  return withEvents(async (tx, emit) => {
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'APPROVED', decidedBy: actorUserId, decidedAt: new Date() },
    })
    await emit({
      type: 'SWAP_APPROVED_BY_LEADER',
      teamId: sr.teamId,
      requesterUserId: sr.requestedByUserId,
    })
    await createAuditLog(tx, {
      actorUserId,
      action: AUDIT_ACTION.SWAP_APPROVED,
      entityType: AUDIT_ENTITY_TYPE.SWAP_REQUEST,
      entityId: swapRequestId,
      beforeJson: JSON.stringify({ status: 'PENDING' }),
      afterJson: JSON.stringify({
        status: 'APPROVED',
        decidedBy: actorUserId,
        fromUserId: sr.fromUserId,
        toUserId: sr.toUserId,
        shiftId: sr.shiftId,
        shiftDate: sr.shift.date,
      }),
    })
    return updated
  })
}

/** Leader rejects a PENDING swap and notifies the requester. */
export async function rejectSwap(swapRequestId: string, actorUserId: string) {
  const sr = await loadSwap(swapRequestId, 'PENDING', 'Swap request is not pending')

  return withEvents(async (tx, emit) => {
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'REJECTED', decidedBy: actorUserId, decidedAt: new Date() },
    })
    await emit({
      type: 'SWAP_REJECTED_BY_LEADER',
      teamId: sr.teamId,
      requesterUserId: sr.requestedByUserId,
    })
    await createAuditLog(tx, {
      actorUserId,
      action: AUDIT_ACTION.SWAP_REJECTED,
      entityType: AUDIT_ENTITY_TYPE.SWAP_REQUEST,
      entityId: swapRequestId,
      beforeJson: JSON.stringify({ status: 'PENDING' }),
      afterJson: JSON.stringify({
        status: 'REJECTED',
        decidedBy: actorUserId,
        fromUserId: sr.fromUserId,
        toUserId: sr.toUserId,
        shiftId: sr.shiftId,
        shiftDate: sr.shift.date,
      }),
    })
    return updated
  })
}

/**
 * Revert an APPROVED or REJECTED swap back to PENDING so a new decision can
 * be made. EXECUTED swaps cannot be revoked — the shift reassignment is not
 * automatically undone. Used when a leader or admin acted by mistake.
 */
export async function revokeSwap(swapRequestId: string, actorUserId: string) {
  const sr = await prisma.swapRequest.findUnique({
    where: { id: swapRequestId },
    include: swapInclude,
  })
  if (!sr) throw new ServiceError('SWAP_NOT_FOUND', 'Swap request not found', 404)
  if (sr.status === 'EXECUTED') {
    throw new ServiceError('SWAP_EXECUTED', 'Executed swaps cannot be revoked', 400)
  }
  if (sr.status !== 'APPROVED' && sr.status !== 'REJECTED') {
    throw new ServiceError('SWAP_WRONG_STATE', 'Only approved or rejected swaps can be revoked', 400)
  }

  return withEvents(async (tx) => {
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'PENDING', decidedBy: null, decidedAt: null },
    })
    await createAuditLog(tx, {
      actorUserId,
      action: AUDIT_ACTION.SWAP_REVOKED,
      entityType: AUDIT_ENTITY_TYPE.SWAP_REQUEST,
      entityId: swapRequestId,
      beforeJson: JSON.stringify({ status: sr.status, decidedBy: sr.decidedBy }),
      afterJson: JSON.stringify({
        status: 'PENDING',
        decidedBy: null,
        fromUserId: sr.fromUserId,
        toUserId: sr.toUserId,
        shiftId: sr.shiftId,
        shiftDate: sr.shift.date,
      }),
    })
    return updated
  })
}

/**
 * Execute an APPROVED swap — reassigns the underlying shift to the new
 * assignee, marks the swap EXECUTED, and notifies both parties.
 */
export async function executeSwap(swapRequestId: string, actorUserId: string) {
  const sr = await loadSwap(
    swapRequestId,
    'APPROVED',
    'Swap request must be approved before execution'
  )

  return withEvents(async (tx, emit) => {
    // Reassign fromUser's shift to toUser.
    await tx.shift.update({
      where: { id: sr.shiftId },
      data: { userId: sr.toUserId },
    })
    // If a specific toShift was selected, also reassign it to fromUser (true two-way swap).
    if (sr.toShiftId) {
      await tx.shift.update({
        where: { id: sr.toShiftId },
        data: { userId: sr.fromUserId },
      })
    }
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'EXECUTED', decidedAt: new Date() },
    })
    await emit({
      type: 'SWAP_EXECUTED_FROM',
      teamId: sr.teamId,
      fromUserId: sr.fromUserId,
      toUserName: sr.toUser.name,
    })
    await emit({
      type: 'SWAP_EXECUTED_TO',
      teamId: sr.teamId,
      toUserId: sr.toUserId,
      fromUserName: sr.fromUser.name,
    })
    await createAuditLog(tx, {
      actorUserId,
      action: AUDIT_ACTION.SWAP_EXECUTED,
      entityType: AUDIT_ENTITY_TYPE.SWAP_REQUEST,
      entityId: swapRequestId,
      beforeJson: JSON.stringify({ status: 'APPROVED' }),
      afterJson: JSON.stringify({
        status: 'EXECUTED',
        fromUserId: sr.fromUserId,
        toUserId: sr.toUserId,
        shiftId: sr.shiftId,
        shiftDate: sr.shift.date,
      }),
    })
    return updated
  })
}
