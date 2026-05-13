import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/auth/withAuth'
import { createAuditLog, AUDIT_ENTITY_TYPE, AUDIT_ACTION } from '@/lib/admin/audit'
import { addMemberSchema } from '@/lib/admin/schemas'

/** POST /api/admin/teams/:teamId/members - Add user to team. Admin only. */
export const POST = withAdmin<{ teamId: string }>(async (request, ctx) => {
  try {
    const { teamId } = ctx.params
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
          actorUserId: ctx.userId,
          action: AUDIT_ACTION.MEMBER_ADDED,
          entityType: AUDIT_ENTITY_TYPE.TEAM_MEMBERSHIP,
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
        actorUserId: ctx.userId,
        action: AUDIT_ACTION.MEMBER_ADDED,
        entityType: AUDIT_ENTITY_TYPE.TEAM_MEMBERSHIP,
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
})
