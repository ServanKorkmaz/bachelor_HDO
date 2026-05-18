import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { shiftTypeBodySchema } from '@/lib/validation/schemas'
import { createAuditLog, AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/lib/admin/audit'

export const dynamic = 'force-dynamic'

/** List all shift types. Any authenticated user can read these. */
export const GET = withAuth(async () => {
  try {
    const shiftTypes = await prisma.shiftType.findMany({
      orderBy: { code: 'asc' },
    })

    return NextResponse.json(shiftTypes)
  } catch (error) {
    console.error('Error fetching shift types:', error)
    return NextResponse.json({ error: 'Failed to fetch shift types' }, { status: 500 })
  }
})

/** Create a new shift type. Admin only — shift types are shared across all teams. */
export const POST = withAdmin(async (request, ctx) => {
  try {
    const parsed = await parseJsonBody(request, shiftTypeBodySchema)
    if ('error' in parsed) return parsed.error
    const { code, label, color, defaultStartTime, defaultEndTime, crossesMidnight } = parsed.data

    const shiftType = await prisma.$transaction(async (tx) => {
      const created = await tx.shiftType.create({
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
        action: AUDIT_ACTION.SHIFT_TYPE_CREATED,
        entityType: AUDIT_ENTITY_TYPE.SHIFT_TYPE,
        entityId: created.id,
        beforeJson: null,
        afterJson: JSON.stringify({ code, label, color }),
      })
      return created
    })

    return NextResponse.json(shiftType)
  } catch (error) {
    console.error('Error creating shift type:', error)
    return NextResponse.json({ error: 'Failed to create shift type' }, { status: 500 })
  }
})
