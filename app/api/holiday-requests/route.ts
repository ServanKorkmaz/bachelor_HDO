import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/admin/audit'
import { holidayTypeToNorwegian } from '@/lib/i18n'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { requireTeamMembership } from '@/lib/auth/requireTeamMembership'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { holidayCreateSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/** List holiday / absence requests for a team. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const auth = await requireTeamMembership(request, teamId)
    if ('error' in auth) return auth.error

    const items = await prisma.holidayRequest.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, name: true } },
        decidedByUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(items)
  } catch (error) {
    console.error('Error fetching holiday requests:', error)
    return NextResponse.json({ error: 'Failed to fetch holiday requests' }, { status: 500 })
  }
}

/** Create a holiday / absence request. */
export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, holidayCreateSchema)
    if ('error' in parsed) return parsed.error
    const { teamId: teamIdBody, userId: userIdBody, type, dateFrom, dateTo, message } = parsed.data

    // Prefer authenticated user when available
    const currentUserId = await getCurrentUserId(request)
    let userId = userIdBody
    let teamId = teamIdBody

    if (currentUserId) {
      // If a current user is provided, override userId and derive teamId from DB
      const u = await prisma.user.findUnique({ where: { id: currentUserId } })
      if (!u) return NextResponse.json({ error: 'Current user not found' }, { status: 404 })
      userId = u.id
      teamId = u.teamId
    }

    if (!teamId || !userId) {
      return NextResponse.json({ error: 'teamId and userId are required' }, { status: 400 })
    }

    // Server-side date validations
    // Use Norway timezone-aware date strings for comparisons (YYYY-MM-DD)
    const { dateNDaysAgoString, todayStringInTimeZone } = await import('@/lib/date-utils')
    const todayStr = todayStringInTimeZone()
    const earliestSickness = dateNDaysAgoString(30)

    if (type !== 'SICKNESS' && dateFrom < todayStr) {
      return NextResponse.json({ error: 'Start date cannot be in the past for holiday/absence' }, { status: 400 })
    }

    if (type === 'SICKNESS' && dateFrom < earliestSickness) {
      return NextResponse.json({ error: 'Sickness requests can only be submitted up to 30 days in the past' }, { status: 400 })
    }

    if (dateTo && dateTo < dateFrom) {
      return NextResponse.json({ error: 'End date cannot be before start date' }, { status: 400 })
    }

    const created = await prisma.$transaction(async (tx: any) => {
      const hr = await tx.holidayRequest.create({
        data: {
          teamId,
          userId,
          type,
          status: 'PENDING',
          dateFrom,
          dateTo: dateTo || null,
          message: message || null,
        },
        include: { user: { select: { id: true, name: true } } },
      })

      const typeNor = holidayTypeToNorwegian(type)
      await tx.notification.create({
        data: {
          teamId,
          userId: null,
          type: 'HOLIDAY_REQUESTED',
          title: 'Ny fraværsforespørsel',
          message: `${hr.user.name} sendte inn en forespørsel om ${typeNor}`,
        },
      })

      await createAuditLog(tx, {
        actorUserId: userId,
        action: 'HOLIDAY_REQUESTED',
        entityType: 'holiday_request',
        entityId: hr.id,
        afterJson: JSON.stringify({ type, dateFrom, dateTo }),
      })

      return hr
    })

    return NextResponse.json(created)
  } catch (error) {
    console.error('Error creating holiday request:', error)
    return NextResponse.json({ error: 'Failed to create holiday request' }, { status: 500 })
  }
}
