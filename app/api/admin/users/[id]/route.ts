import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createAuditLog } from '@/lib/admin/audit'
import { patchUserStatusSchema } from '@/lib/admin/schemas'

/** PATCH /api/admin/users/:id - Activate/deactivate user. Admin only. Soft only; writes audit log. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult: { currentUser?: { id: string; role: string } } = {}
  const err = await requireAdmin(request, authResult)
  if (err) return err
  const actorId = authResult.currentUser!.id

  try {
    const { id: userId } = await params
    const body = await request.json().catch(() => ({}))
    const parsed = patchUserStatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { status } = parsed.data

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, name: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (existing.status === status) {
      const unchanged = await prisma.user.findUnique({
        where: { id: userId },
      })
      return NextResponse.json(unchanged)
    }

    const beforeJson = JSON.stringify({ status: existing.status })
    const afterJson = JSON.stringify({ status })

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: { status },
      })
      await createAuditLog(tx, {
        actorUserId: actorId,
        action: 'USER_STATUS_CHANGED',
        entityType: 'user',
        entityId: userId,
        beforeJson,
        afterJson,
      })
      return u
    })

    return NextResponse.json(updated)
  } catch (e) {
    console.error('PATCH /api/admin/users/[id]', e)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}
