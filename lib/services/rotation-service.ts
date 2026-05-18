import { prisma } from '@/lib/prisma'
import { createAuditLog, AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/lib/admin/audit'
import { ServiceError } from './errors'
import type {
  RotationPatternCreateBody,
  RotationPatternUpdateBody,
  RotationSlot,
} from '@/lib/validation/rotation-schemas'

export interface RotationPatternRow {
  id: string
  teamId: string
  name: string
  weeks: number
  slotsJson: string
  createdAt: Date
  updatedAt: Date
}

interface ServiceInput {
  actorUserId: string
}

/**
 * Validate slot integrity. Run inside the same transaction as the write so
 * a race condition (user deactivated between check and write) cannot pass.
 */
async function assertSlotsValid(
  tx: typeof prisma,
  teamId: string,
  slots: RotationSlot[]
): Promise<void> {
  const seen = new Set<string>()
  for (const slot of slots) {
    const key = `${slot.userId}|${slot.weekIndex}|${slot.dayOfWeek}`
    if (seen.has(key)) {
      throw new ServiceError(
        'DUPLICATE_SLOT',
        `Duplikat slot for samme bruker på samme dag i cycle`,
        400
      )
    }
    seen.add(key)
  }

  const userIds = Array.from(new Set(slots.map((s) => s.userId)))
  const shiftTypeIds = Array.from(new Set(slots.map((s) => s.shiftTypeId)))

  if (userIds.length > 0) {
    const users = await tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    })
    if (users.length !== userIds.length) {
      throw new ServiceError('USER_NOT_FOUND', 'En eller flere ansatte finnes ikke', 400)
    }

    const memberships = await tx.teamMembership.findMany({
      where: { userId: { in: userIds }, teamId, status: 'active' },
      select: { userId: true },
    })
    if (memberships.length !== userIds.length) {
      throw new ServiceError(
        'USER_NOT_TEAM_MEMBER',
        'En eller flere ansatte er ikke aktive medlemmer av teamet',
        400
      )
    }
  }

  if (shiftTypeIds.length > 0) {
    const types = await tx.shiftType.findMany({
      where: { id: { in: shiftTypeIds } },
      select: { id: true },
    })
    if (types.length !== shiftTypeIds.length) {
      throw new ServiceError('SHIFT_TYPE_NOT_FOUND', 'En eller flere vakttyper finnes ikke', 400)
    }
  }
}

export async function createPattern(
  input: RotationPatternCreateBody & ServiceInput
): Promise<RotationPatternRow> {
  return prisma.$transaction(async (tx) => {
    await assertSlotsValid(tx as typeof prisma, input.teamId, input.slots)

    const created = await tx.rotationPattern.create({
      data: {
        teamId: input.teamId,
        name: input.name,
        weeks: input.weeks,
        slotsJson: JSON.stringify(input.slots),
      },
    })

    await createAuditLog(tx, {
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.ROTATION_PATTERN_CREATED,
      entityType: AUDIT_ENTITY_TYPE.ROTATION_PATTERN,
      entityId: created.id,
      beforeJson: null,
      afterJson: JSON.stringify({
        teamId: created.teamId,
        name: created.name,
        weeks: created.weeks,
        slotCount: input.slots.length,
      }),
    })

    return created
  })
}

export async function listPatterns(teamId: string): Promise<RotationPatternRow[]> {
  return prisma.rotationPattern.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getPattern(id: string): Promise<RotationPatternRow> {
  const pattern = await prisma.rotationPattern.findUnique({ where: { id } })
  if (!pattern) {
    throw new ServiceError('ROTATION_PATTERN_NOT_FOUND', 'Turnusmønster ikke funnet', 404)
  }
  return pattern
}

export async function updatePattern(
  id: string,
  input: RotationPatternUpdateBody & ServiceInput
): Promise<RotationPatternRow> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.rotationPattern.findUnique({ where: { id } })
    if (!existing) {
      throw new ServiceError('ROTATION_PATTERN_NOT_FOUND', 'Turnusmønster ikke funnet', 404)
    }

    await assertSlotsValid(tx as typeof prisma, input.teamId, input.slots)

    const updated = await tx.rotationPattern.update({
      where: { id },
      data: {
        teamId: input.teamId,
        name: input.name,
        weeks: input.weeks,
        slotsJson: JSON.stringify(input.slots),
      },
    })

    await createAuditLog(tx, {
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.ROTATION_PATTERN_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.ROTATION_PATTERN,
      entityId: id,
      beforeJson: JSON.stringify({
        teamId: existing.teamId,
        name: existing.name,
        weeks: existing.weeks,
      }),
      afterJson: JSON.stringify({
        teamId: updated.teamId,
        name: updated.name,
        weeks: updated.weeks,
        slotCount: input.slots.length,
      }),
    })

    return updated
  })
}

export async function deletePattern(id: string, actorUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.rotationPattern.findUnique({ where: { id } })
    if (!existing) {
      throw new ServiceError('ROTATION_PATTERN_NOT_FOUND', 'Turnusmønster ikke funnet', 404)
    }

    await tx.rotationPattern.delete({ where: { id } })

    await createAuditLog(tx, {
      actorUserId,
      action: AUDIT_ACTION.ROTATION_PATTERN_DELETED,
      entityType: AUDIT_ENTITY_TYPE.ROTATION_PATTERN,
      entityId: id,
      beforeJson: JSON.stringify({
        teamId: existing.teamId,
        name: existing.name,
        weeks: existing.weeks,
      }),
      afterJson: null,
    })
  })
}
