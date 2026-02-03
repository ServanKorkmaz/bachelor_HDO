import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'

/** Execute an approved swap request and notify both users. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const swapRequest = await prisma.swapRequest.findUnique({
      where: { id: params.id },
      include: {
        shift: true,
        requestedBy: true,
        fromUser: true,
        toUser: true,
      },
    })

    if (!swapRequest) {
      return NextResponse.json({ error: 'Swap request not found' }, { status: 404 })
    }

    if (swapRequest.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Swap request must be approved before execution' },
        { status: 400 }
      )
    }

    // Update the shift to swap the user
    await prisma.shift.update({
      where: { id: swapRequest.shiftId },
      data: {
        userId: swapRequest.toUserId,
      },
    })

    // Update swap request status
    const updated = await prisma.swapRequest.update({
      where: { id: params.id },
      data: {
        status: 'EXECUTED',
        decidedAt: new Date(),
      },
    })

    const fromTitle = 'Vaktbytte utført'
    const fromMessage = `Vaktbytte utført: ${swapRequest.toUser.name} har overtatt vakten`
    const toMessage = `Du har overtatt vakten fra ${swapRequest.fromUser.name}`
    await Promise.all([
      prisma.notification.create({
        data: {
          teamId: swapRequest.teamId,
          userId: swapRequest.fromUserId,
          type: 'SWAP_EXECUTED',
          title: fromTitle,
          message: fromMessage,
        },
      }),
      prisma.notification.create({
        data: {
          teamId: swapRequest.teamId,
          userId: swapRequest.toUserId,
          type: 'SWAP_EXECUTED',
          title: fromTitle,
          message: toMessage,
        },
      }),
    ])
    deliverNotificationToChannels({
      userId: swapRequest.fromUserId,
      teamId: swapRequest.teamId,
      type: 'SWAP_EXECUTED',
      title: fromTitle,
      message: fromMessage,
    }).catch(console.error)
    deliverNotificationToChannels({
      userId: swapRequest.toUserId,
      teamId: swapRequest.teamId,
      type: 'SWAP_EXECUTED',
      title: fromTitle,
      message: toMessage,
    }).catch(console.error)

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error executing swap request:', error)
    return NextResponse.json({ error: 'Failed to execute swap request' }, { status: 500 })
  }
}

