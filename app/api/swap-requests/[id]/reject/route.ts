import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const swapRequest = await prisma.swapRequest.findUnique({
      where: { id: params.id },
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

    const updated = await prisma.swapRequest.update({
      where: { id: params.id },
      data: {
        status: 'REJECTED',
        decidedAt: new Date(),
      },
    })

    // Create notification
    await prisma.notification.create({
      data: {
        teamId: swapRequest.teamId,
        userId: swapRequest.requestedByUserId,
        type: 'SWAP_REJECTED',
        title: 'Vaktbytteforespørsel avvist',
        message: `Din forespørsel om vaktbytte er avvist`,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error rejecting swap request:', error)
    return NextResponse.json({ error: 'Failed to reject swap request' }, { status: 500 })
  }
}

