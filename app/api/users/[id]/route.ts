import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { userRoleUpdateSchema } from '@/lib/validation/schemas'
import { createAuditLog, AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/lib/admin/audit'

/** Get a user by id. Any authenticated user can look up another user's basic profile. */
export const GET = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: ctx.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        team: { select: { name: true } },
      },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json(user)
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
})

/** Update a user's role by id. Admin only. Writes an audit log entry
 *  alongside the update in a single transaction so the change can never
 *  appear in the DB without a matching audit trail. */
export const PUT = withAdmin<{ id: string }>(async (request, ctx) => {
  try {
    const parsed = await parseJsonBody(request, userRoleUpdateSchema)
    if ('error' in parsed) return parsed.error
    const { role } = parsed.data

    const existing = await prisma.user.findUnique({
      where: { id: ctx.params.id },
      select: { id: true, role: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (existing.role === role) {
      return NextResponse.json(existing)
    }

    const beforeJson = JSON.stringify({ role: existing.role })
    const afterJson = JSON.stringify({ role })

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: ctx.params.id },
        data: { role },
      })
      await createAuditLog(tx, {
        actorUserId: ctx.userId,
        action: AUDIT_ACTION.USER_ROLE_CHANGED,
        entityType: AUDIT_ENTITY_TYPE.USER,
        entityId: ctx.params.id,
        beforeJson,
        afterJson,
      })
      return updated
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
})
