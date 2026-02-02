import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** List swap requests for a team. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const swapRequests = await prisma.swapRequest.findMany({
      where: { teamId },
      include: {
        requestedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        fromUser: {
          select: {
            id: true,
            name: true,
          },
        },
        toUser: {
          select: {
            id: true,
            name: true,
          },
        },
        shift: {
          include: {
            shiftType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(swapRequests)
  } catch (error) {
    console.error('Error fetching swap requests:', error)
    return NextResponse.json({ error: 'Failed to fetch swap requests' }, { status: 500 })
  }
}

/** Create a swap request and notify the team. */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { teamId, requestedByUserId, shiftId, toUserId, message } = body

    if (!teamId || !requestedByUserId || !shiftId || !toUserId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get the shift to find the fromUserId
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
    })

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }

    const swapRequest = await prisma.swapRequest.create({
      data: {
        teamId,
        requestedByUserId,
        fromUserId: shift.userId,
        toUserId,
        shiftId,
        status: 'PENDING',
        message: message || null,
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        fromUser: {
          select: {
            id: true,
            name: true,
          },
        },
        toUser: {
          select: {
            id: true,
            name: true,
          },
        },
        shift: {
          include: {
            shiftType: true,
          },
        },
      },
    })

    // Create notification
    await prisma.notification.create({
      data: {
        teamId,
        type: 'SWAP_REQUESTED',
        title: 'Ny vaktbytteforespørsel',
        message: `${swapRequest.requestedBy.name} har forespurt vaktbytte`,
      },
    })

    return NextResponse.json(swapRequest)
  } catch (error) {
    console.error('Error creating swap request:', error)
    return NextResponse.json({ error: 'Failed to create swap request' }, { status: 500 })
  }
}

