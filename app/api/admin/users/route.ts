import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/auth/withAuth'
import { createAuditLog, AUDIT_ENTITY_TYPE, AUDIT_ACTION } from '@/lib/admin/audit'
import { createUserSchema } from '@/lib/admin/schemas'

export const dynamic = 'force-dynamic'

/** GET /api/admin/users - List users with optional filters (teamId, q, status). Admin only. */
export const GET = withAdmin(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId') || undefined
    const q = searchParams.get('q')?.trim() || undefined
    const status = searchParams.get('status') || undefined

    const where: Record<string, unknown> = {}

    if (status === 'active' || status === 'inactive') {
      where.status = status
    }
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
      ]
    }
    if (teamId) {
      where.teamMemberships = { some: { teamId } }
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      include: {
        team: { select: { id: true, name: true } },
        teamMemberships: {
          where: { status: 'active' },
          include: { team: { select: { id: true, name: true } } },
        },
      },
    })

    const list = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      teams: u.teamMemberships.map((m) => ({
        teamId: m.teamId,
        teamName: m.team.name,
        role: m.role,
        membershipId: m.id,
      })),
      primaryTeam: u.team ? { id: u.team.id, name: u.team.name } : null,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }))

    return NextResponse.json(list)
  } catch (e) {
    console.error('GET /api/admin/users', e)
    return NextResponse.json(
      { error: 'Failed to list users' },
      { status: 500 }
    )
  }
})

/** POST /api/admin/users - Create new user. Admin only. Creates User + TeamMembership + audit. */
export const POST = withAdmin(async (request, ctx) => {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ugyldig data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { name, email, teamId, role } = parsed.data

    const team = await prisma.team.findUnique({ where: { id: teamId } })
    if (!team) {
      return NextResponse.json({ error: 'Team ikke funnet' }, { status: 404 })
    }
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'E-post er allerede i bruk' }, { status: 409 })
    }

    const membershipRole = role === 'ADMIN' ? 'LEADER' : role

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          role,
          teamId,
          status: 'active',
        },
      })
      await tx.teamMembership.create({
        data: {
          userId: user.id,
          teamId,
          role: membershipRole,
          status: 'active',
        },
      })
      await createAuditLog(tx, {
        actorUserId: ctx.userId,
        action: AUDIT_ACTION.USER_CREATED,
        entityType: AUDIT_ENTITY_TYPE.USER,
        entityId: user.id,
        afterJson: JSON.stringify({ name, email, teamId, role }),
      })
      return user
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error('POST /api/admin/users', e)
    return NextResponse.json(
      { error: 'Kunne ikke opprette bruker' },
      { status: 500 }
    )
  }
})
