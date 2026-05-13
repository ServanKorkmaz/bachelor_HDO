import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { requireTeamMembership } from '@/lib/auth/requireTeamMembership'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { shiftCreateSchema } from '@/lib/validation/schemas'
import { parse, format } from 'date-fns'

export const dynamic = 'force-dynamic'

/** List shifts for a team, optionally filtered by date range or user. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const userId = searchParams.get('userId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const auth = await requireTeamMembership(request, teamId)
    if ('error' in auth) return auth.error

    const where: any = { teamId }

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
}

/** Create a shift and emit a notification for the affected user. */
export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, shiftCreateSchema)
    if ('error' in parsed) return parsed.error
    const { date, userId, shiftTypeId, startTime, endTime, comment, teamId } = parsed.data

    // Get teamId from user if not provided
    let finalTeamId = teamId
    if (!finalTeamId) {
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      finalTeamId = user.teamId
    }

    // Only ADMIN/LEADER of the target team may create shifts
    const auth = await requireTeamMembership(request, finalTeamId, ['ADMIN', 'LEADER'])
    if ('error' in auth) return auth.error

    // Get shift type to check if it crosses midnight
    const shiftType = await prisma.shiftType.findUnique({
      where: { id: shiftTypeId },
    })

    if (!shiftType) {
      return NextResponse.json({ error: 'Shift type not found' }, { status: 404 })
    }

    const startDateTime = parse(`${date}T${startTime}`, "yyyy-MM-dd'T'HH:mm", new Date())
    let endDateTime = parse(`${date}T${endTime}`, "yyyy-MM-dd'T'HH:mm", new Date())

    if (shiftType.crossesMidnight || endDateTime <= startDateTime) {
      // Add one day if crosses midnight
      endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000)
    }

    let shift
    try {
      shift = await prisma.shift.create({
        data: {
          teamId: finalTeamId,
          userId,
          date,
          startDateTime,
          endDateTime,
          shiftTypeId,
          comment: comment || null,
        },
        include: {
          shiftType: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
    } catch (e) {
      // P2002 = unique constraint violation on (userId, date)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json(
          { error: 'Brukeren har allerede en vakt på denne datoen' },
          { status: 409 }
        )
      }
      throw e
    }

    const title = 'Vakt opprettet'
    const message = `Ny vakt opprettet for ${shift.user.name} på ${date}`
    await prisma.notification.create({
      data: {
        teamId: finalTeamId,
        userId,
        type: 'SHIFT_CREATED',
        title,
        message,
      },
    })
    deliverNotificationToChannels({ userId, teamId: finalTeamId, type: 'SHIFT_CREATED', title, message }).catch(console.error)

    return NextResponse.json(shift)
  } catch (error) {
    console.error('Error creating shift:', error)
    return NextResponse.json({ error: 'Failed to create shift' }, { status: 500 })
  }
}

