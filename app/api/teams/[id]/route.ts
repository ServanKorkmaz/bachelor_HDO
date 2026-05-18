import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/auth/withAuth'
import { createAuditLog, AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/lib/admin/audit'
import { ServiceError, serviceErrorResponse } from '@/lib/services/errors'

/** Delete a team by id. Admin only. */
export const DELETE = withAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.team.findUnique({ where: { id: ctx.params.id } })
      if (!existing) {
        throw new ServiceError('TEAM_NOT_FOUND', 'Team not found', 404)
      }
      await tx.team.delete({ where: { id: ctx.params.id } })
      await createAuditLog(tx, {
        actorUserId: ctx.userId,
        action: AUDIT_ACTION.TEAM_DELETED,
        entityType: AUDIT_ENTITY_TYPE.TEAM,
        entityId: ctx.params.id,
        beforeJson: JSON.stringify({ name: existing.name }),
        afterJson: null,
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error deleting team:', error)
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 })
  }
})
