import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'

/** Approve a swap request by id and notify the requester. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const swapRequest = await prisma.swapRequest.findUnique({
      where: { id: params.id },
      include: {
        requestedBy: true,
        fromUser: true,
        toUser: true,
      },
    })

    if (!swapRequest) {
      return NextResponse.json({ error: 'Swap request not found' }, { status: 404 })
    }

    if (swapRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Swap request is not pending' },
        { status: 400 }
      )
    }

    // TODO: Get current user from auth context
    const updated = await prisma.swapRequest.update({
      where: { id: params.id },
      data: {
        status: 'APPROVED',
        // decidedBy: currentUserId, // TODO: Add when auth is implemented
        decidedAt: new Date(),
      },
    })

    // Create notification
    const title = 'Vaktbytteforespørsel godkjent'
    const message = 'Din forespørsel om vaktbytte er godkjent'
    await prisma.notification.create({
      data: {
        teamId: swapRequest.teamId,
        userId: swapRequest.requestedByUserId,
        type: 'SWAP_APPROVED',
        title,
        message,
      },
    })
    deliverNotificationToChannels({
      userId: swapRequest.requestedByUserId,
      teamId: swapRequest.teamId,
      type: 'SWAP_APPROVED',
      title,
      message,
    }).catch(console.error)

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error approving swap request:', error)
    return NextResponse.json({ error: 'Failed to approve swap request' }, { status: 500 })
  }
}

