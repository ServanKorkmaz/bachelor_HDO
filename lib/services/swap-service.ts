import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { createAuditLog, AUDIT_ENTITY_TYPE, AUDIT_ACTION } from '@/lib/admin/audit'
import { ServiceError } from './errors'

const swapInclude = {
  requestedBy: { select: { id: true, name: true } },
  fromUser: { select: { id: true, name: true } },
  toUser: { select: { id: true, name: true } },
  shift: { include: { shiftType: true } },
} satisfies Prisma.SwapRequestInclude

export type SwapWithRelations = Prisma.SwapRequestGetPayload<{ include: typeof swapInclude }>

export interface CreateSwapInput {
  teamId: string
  requestedByUserId: string
  shiftId: string
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

  return prisma.$transaction(async (tx) => {
    const sr = await tx.swapRequest.create({
      data: {
        teamId: input.teamId,
        requestedByUserId: input.requestedByUserId,
        fromUserId: shift.userId,
        toUserId: input.toUserId,
        shiftId: input.shiftId,
        status: 'AWAITING_ACCEPTANCE',
        message: input.message || null,
      },
      include: swapInclude,
    })
    await tx.notification.create({
      data: {
        teamId: input.teamId,
        userId: input.toUserId,
        type: 'SWAP_REQUESTED',
        title: 'Vaktbytteforespørsel',
        message: `${sr.requestedBy.name} ønsker å bytte vakt med deg`,
      },
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'PENDING' },
    })
    await tx.notification.create({
      data: {
        teamId: sr.teamId,
        userId: sr.requestedByUserId,
        type: 'SWAP_ACCEPTED_BY_COLLEAGUE',
        title: 'Kollega godtok vaktbytte',
        message: `${sr.toUser.name} godtok din vaktbytteforespørsel. Venter nå på leder.`,
      },
    })
    await tx.notification.create({
      data: {
        teamId: sr.teamId,
        userId: null,
        type: 'SWAP_REQUESTED',
        title: 'Vaktbytte klar for godkjenning',
        message: `${sr.requestedBy.name} og ${sr.toUser.name} er enige om vaktbytte`,
      },
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'REJECTED', decidedBy: actorUserId, decidedAt: new Date() },
    })
    await tx.notification.create({
      data: {
        teamId: sr.teamId,
        userId: sr.requestedByUserId,
        type: 'SWAP_REJECTED',
        title: 'Vaktbytte avslått',
        message: `${sr.toUser.name} avslo din vaktbytteforespørsel`,
      },
    })
    return updated
  })
}

/** Leader approves a PENDING swap and notifies the requester. */
export async function approveSwap(swapRequestId: string, actorUserId: string) {
  const sr = await loadSwap(swapRequestId, 'PENDING', 'Swap request is not pending')

  const title = 'Vaktbytteforespørsel godkjent'
  const message = 'Din forespørsel om vaktbytte er godkjent'

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'APPROVED', decidedBy: actorUserId, decidedAt: new Date() },
    })
    await tx.notification.create({
      data: {
        teamId: sr.teamId,
        userId: sr.requestedByUserId,
        type: 'SWAP_APPROVED',
        title,
        message,
      },
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
    return u
  })

  void deliverNotificationToChannels({
    userId: sr.requestedByUserId,
    teamId: sr.teamId,
    type: 'SWAP_APPROVED',
    title,
    message,
  })

  return updated
}

/** Leader rejects a PENDING swap and notifies the requester. */
export async function rejectSwap(swapRequestId: string, actorUserId: string) {
  const sr = await loadSwap(swapRequestId, 'PENDING', 'Swap request is not pending')

  const title = 'Vaktbytteforespørsel avvist'
  const message = 'Din forespørsel om vaktbytte er avvist'

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'REJECTED', decidedBy: actorUserId, decidedAt: new Date() },
    })
    await tx.notification.create({
      data: {
        teamId: sr.teamId,
        userId: sr.requestedByUserId,
        type: 'SWAP_REJECTED',
        title,
        message,
      },
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
    return u
  })

  void deliverNotificationToChannels({
    userId: sr.requestedByUserId,
    teamId: sr.teamId,
    type: 'SWAP_REJECTED',
    title,
    message,
  })

  return updated
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

  const title = 'Vaktbytte utført'
  const fromMessage = `Vaktbytte utført: ${sr.toUser.name} har overtatt vakten`
  const toMessage = `Du har overtatt vakten fra ${sr.fromUser.name}`

  const updated = await prisma.$transaction(async (tx) => {
    await tx.shift.update({
      where: { id: sr.shiftId },
      data: { userId: sr.toUserId },
    })
    const u = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: 'EXECUTED', decidedAt: new Date() },
    })
    await tx.notification.create({
      data: {
        teamId: sr.teamId,
        userId: sr.fromUserId,
        type: 'SWAP_EXECUTED',
        title,
        message: fromMessage,
      },
    })
    await tx.notification.create({
      data: {
        teamId: sr.teamId,
        userId: sr.toUserId,
        type: 'SWAP_EXECUTED',
        title,
        message: toMessage,
      },
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
    return u
  })

  void deliverNotificationToChannels({
    userId: sr.fromUserId,
    teamId: sr.teamId,
    type: 'SWAP_EXECUTED',
    title,
    message: fromMessage,
  })
  void deliverNotificationToChannels({
    userId: sr.toUserId,
    teamId: sr.teamId,
    type: 'SWAP_EXECUTED',
    title,
    message: toMessage,
  })

  return updated
}
