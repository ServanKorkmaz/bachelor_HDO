import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parse, format } from 'date-fns'

// Helper to check if user can edit shifts (reuses canEditShifts logic)
function canEditShifts(userRole: string | null): boolean {
  return userRole === 'ADMIN' || userRole === 'LEADER'
}

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

export async function POST(request: Request) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (!canEditShifts(userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { date, userId, shiftTypeId, startTime, endTime, comment, teamId } = body

    if (!date || !userId || !shiftTypeId || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get teamId from user if not provided
    let finalTeamId = teamId
    if (!finalTeamId) {
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      finalTeamId = user.teamId
    }

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

    const shift = await prisma.shift.create({
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

    // Create notification
    await prisma.notification.create({
      data: {
        teamId: finalTeamId,
        userId,
        type: 'SHIFT_CREATED',
        title: 'Vakt opprettet',
        message: `Ny vakt opprettet for ${shift.user.name} på ${date}`,
      },
    })

    return NextResponse.json(shift)
  } catch (error) {
    console.error('Error creating shift:', error)
    return NextResponse.json({ error: 'Failed to create shift' }, { status: 500 })
  }
}

