import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'

export const dynamic = 'force-dynamic'

/**
 * List notifications. A user can read their own; ADMIN/LEADER can read the
 * team-wide feed when a teamId is supplied. Anyone else gets 403.
 */
export const GET = withAuth(async (request, ctx) => {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const teamId = searchParams.get('teamId')

    if (!userId && !teamId) {
      return NextResponse.json({ error: 'userId or teamId is required' }, { status: 400 })
    }

    if (userId && userId !== ctx.userId && ctx.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (teamId) {
      const forbidden = await assertTeamMember(ctx, teamId)
      if (forbidden) return forbidden
    }

    const where: Prisma.NotificationWhereInput = {}
    if (userId) {
      where.userId = userId
    }
    if (teamId) {
      where.teamId = teamId
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json(notifications)
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
})
