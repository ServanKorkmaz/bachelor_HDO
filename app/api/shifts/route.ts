import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { shiftCreateSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { createShift } from '@/lib/services/shift-service'
import { serviceErrorResponse } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

/** List shifts for a team, optionally filtered by date range or user. */
export const GET = withAuth(async (request, ctx) => {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const userId = searchParams.get('userId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const forbidden = await assertTeamMember(ctx, teamId)
    if (forbidden) return forbidden

    const where: Prisma.ShiftWhereInput = { teamId }

    if (dateFrom && dateTo) {
      where.date = {
        gte: dateFrom,
        lte: dateTo,
      }
    }

    if (userId) {
      where.userId = userId
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        shiftType: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { date: 'asc' },
        { startDateTime: 'asc' },
      ],
    })

    return NextResponse.json(shifts)
  } catch (error) {
    console.error('Error fetching shifts:', error)
    return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 })
  }
})

/** Create a shift and emit a notification for the affected user. */
export const POST = withAuth(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.shiftWrite)
    if (limited) return limited

    const parsed = await parseJsonBody(request, shiftCreateSchema)
    if ('error' in parsed) return parsed.error
    const { date, userId, shiftTypeId, startTime, endTime, comment, teamId } = parsed.data

    let finalTeamId = teamId
    if (!finalTeamId) {
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      finalTeamId = user.teamId
    }

    const forbidden = await assertTeamMember(ctx, finalTeamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden

    const shift = await createShift({
      teamId: finalTeamId,
      userId,
      actorUserId: ctx.userId,
      date,
      shiftTypeId,
      startTime,
      endTime,
      comment,
    })

    return NextResponse.json(shift)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error creating shift:', error)
    return NextResponse.json({ error: 'Failed to create shift' }, { status: 500 })
  }
})

