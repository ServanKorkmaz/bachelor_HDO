import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { teamCreateSchema } from '@/lib/validation/schemas'
import { createAuditLog, AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/lib/admin/audit'

export const dynamic = 'force-dynamic'

/** List teams. ADMIN sees every team; anyone else sees only teams they belong to. */
export const GET = withAuth(async (_request, ctx) => {
  try {
    const teams = ctx.role === 'ADMIN'
      ? await prisma.team.findMany({ orderBy: { name: 'asc' } })
      : await prisma.team.findMany({
          where: {
            memberships: { some: { userId: ctx.userId, status: 'active' } },
          },
          orderBy: { name: 'asc' },
        })

    return NextResponse.json(teams)
  } catch (error) {
    console.error('Error fetching teams:', error)
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }
})

/** Create a team and default notification settings. Admin only. */
export const POST = withAdmin(async (request, ctx) => {
  try {
    const parsed = await parseJsonBody(request, teamCreateSchema)
    if ('error' in parsed) return parsed.error
    const { name } = parsed.data

    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({ data: { name } })
      await tx.notificationSettings.create({
        data: {
          teamId: created.id,
          emailEnabled: true,
          smsEndpoint: null,
        },
      })
      await createAuditLog(tx, {
        actorUserId: ctx.userId,
        action: AUDIT_ACTION.TEAM_CREATED,
        entityType: AUDIT_ENTITY_TYPE.TEAM,
        entityId: created.id,
        beforeJson: null,
        afterJson: JSON.stringify({ name: created.name }),
      })
      return created
    })

    return NextResponse.json(team)
  } catch (error) {
    console.error('Error creating team:', error)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
})
