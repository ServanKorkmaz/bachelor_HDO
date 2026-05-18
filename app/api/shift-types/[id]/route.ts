import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { shiftTypeBodySchema } from '@/lib/validation/schemas'
import { createAuditLog, AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/lib/admin/audit'

/** Update a shift type by id. Admin only. */
export const PUT = withAdmin<{ id: string }>(async (request, ctx) => {
  try {
    const parsed = await parseJsonBody(request, shiftTypeBodySchema)
    if ('error' in parsed) return parsed.error
    const { code, label, color, defaultStartTime, defaultEndTime, crossesMidnight } = parsed.data

    const shiftType = await prisma.$transaction(async (tx) => {
      const existing = await tx.shiftType.findUnique({ where: { id: ctx.params.id } })
      if (!existing) {
        throw new Error('NOT_FOUND')
      }
      const updated = await tx.shiftType.update({
        where: { id: ctx.params.id },
        data: {
          code,
          label,
          color,
          defaultStartTime,
          defaultEndTime,
          crossesMidnight: crossesMidnight ?? false,
        },
      })
      await createAuditLog(tx, {
        actorUserId: ctx.userId,
        action: AUDIT_ACTION.SHIFT_TYPE_UPDATED,
        entityType: AUDIT_ENTITY_TYPE.SHIFT_TYPE,
        entityId: updated.id,
        beforeJson: JSON.stringify({
          code: existing.code,
          label: existing.label,
          color: existing.color,
        }),
        afterJson: JSON.stringify({ code, label, color }),
      })
      return updated
    })

    return NextResponse.json(shiftType)
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Shift type not found' }, { status: 404 })
    }
    console.error('Error updating shift type:', error)
    return NextResponse.json({ error: 'Failed to update shift type' }, { status: 500 })
  }
})

/** Delete a shift type by id. Admin only. */
export const DELETE = withAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.shiftType.findUnique({ where: { id: ctx.params.id } })
      if (!existing) {
        throw new Error('NOT_FOUND')
      }
      await tx.shiftType.delete({ where: { id: ctx.params.id } })
      await createAuditLog(tx, {
        actorUserId: ctx.userId,
        action: AUDIT_ACTION.SHIFT_TYPE_DELETED,
        entityType: AUDIT_ENTITY_TYPE.SHIFT_TYPE,
        entityId: ctx.params.id,
        beforeJson: JSON.stringify({
          code: existing.code,
          label: existing.label,
          color: existing.color,
        }),
        afterJson: null,
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Shift type not found' }, { status: 404 })
    }
    console.error('Error deleting shift type:', error)
    return NextResponse.json({ error: 'Failed to delete shift type' }, { status: 500 })
  }
})
