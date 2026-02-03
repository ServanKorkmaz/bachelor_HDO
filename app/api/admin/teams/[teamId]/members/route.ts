import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createAuditLog } from '@/lib/admin/audit'
import { addMemberSchema } from '@/lib/admin/schemas'

/** POST /api/admin/teams/:teamId/members - Add user to team. Admin only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const authResult: { currentUser?: { id: string; role: string } } = {}
  const err = await requireAdmin(request, authResult)
  if (err) return err
  const actorId = authResult.currentUser!.id

  try {
    const { teamId } = await params
    const body = await request.json().catch(() => ({}))
    const parsed = addMemberSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { userId, role } = parsed.data

    const [team, user] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ])
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const existing = await prisma.teamMembership.findUnique({
      where: {
        userId_teamId: { userId, teamId },
      },
    })
    if (existing) {
      if (existing.status === 'active') {
        return NextResponse.json(
          { error: 'User is already in this team' },
          { status: 409 }
        )
      }
      const afterJson = JSON.stringify({
        userId,
        teamId,
        role,
        status: 'active',
      })
      const membership = await prisma.$transaction(async (tx) => {
        const m = await tx.teamMembership.update({
          where: { id: existing.id },
          data: { role, status: 'active' },
          include: { team: { select: { id: true, name: true } } },
        })
        await createAuditLog(tx, {
          actorUserId: actorId,
          action: 'MEMBER_ADDED',
          entityType: 'team_membership',
          entityId: existing.id,
          afterJson,
        })
        return m
      })
      return NextResponse.json(membership)
    }

    const afterJson = JSON.stringify({ userId, teamId, role, status: 'active' })
    const membership = await prisma.$transaction(async (tx) => {
      const m = await tx.teamMembership.create({
        data: { userId, teamId, role, status: 'active' },
        include: { team: { select: { id: true, name: true } } },
      })
      await createAuditLog(tx, {
        actorUserId: actorId,
        action: 'MEMBER_ADDED',
        entityType: 'team_membership',
        entityId: m.id,
        afterJson,
      })
      return m
    })
    return NextResponse.json(membership)
  } catch (e) {
    console.error('POST /api/admin/teams/[teamId]/members', e)
    return NextResponse.json(
      { error: 'Failed to add member' },
      { status: 500 }
    )
  }
}
