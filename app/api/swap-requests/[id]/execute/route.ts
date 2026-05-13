import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { createAuditLog, AUDIT_ENTITY_TYPE, AUDIT_ACTION } from '@/lib/admin/audit'

/** Execute an approved swap request and notify both users. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = await getCurrentUserId(request)
    if (!currentUserId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

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

    const fromTitle = 'Vaktbytte utført'
    const fromMessage = `Vaktbytte utført: ${swapRequest.toUser.name} har overtatt vakten`
    const toMessage = `Du har overtatt vakten fra ${swapRequest.fromUser.name}`

    const updated = await prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: { id: swapRequest.shiftId },
        data: { userId: swapRequest.toUserId },
      })
      const u = await tx.swapRequest.update({
        where: { id: params.id },
        data: {
          status: 'EXECUTED',
          decidedAt: new Date(),
        },
      })
      await tx.notification.create({
        data: {
          teamId: swapRequest.teamId,
          userId: swapRequest.fromUserId,
          type: 'SWAP_EXECUTED',
          title: fromTitle,
          message: fromMessage,
        },
      })
      await tx.notification.create({
        data: {
          teamId: swapRequest.teamId,
          userId: swapRequest.toUserId,
          type: 'SWAP_EXECUTED',
          title: fromTitle,
          message: toMessage,
        },
      })
      await createAuditLog(tx, {
        actorUserId: currentUserId,
        action: AUDIT_ACTION.SWAP_EXECUTED,
        entityType: AUDIT_ENTITY_TYPE.SWAP_REQUEST,
        entityId: params.id,
        beforeJson: JSON.stringify({ status: 'APPROVED' }),
        afterJson: JSON.stringify({
          status: 'EXECUTED',
          fromUserId: swapRequest.fromUserId,
          toUserId: swapRequest.toUserId,
          shiftId: swapRequest.shiftId,
          shiftDate: swapRequest.shift.date,
        }),
      })
      return u
    })

    void deliverNotificationToChannels({
      userId: swapRequest.fromUserId,
      teamId: swapRequest.teamId,
      type: 'SWAP_EXECUTED',
      title: fromTitle,
      message: fromMessage,
    })
    void deliverNotificationToChannels({
      userId: swapRequest.toUserId,
      teamId: swapRequest.teamId,
      type: 'SWAP_EXECUTED',
      title: fromTitle,
      message: toMessage,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error executing swap request:', error)
    return NextResponse.json({ error: 'Failed to execute swap request' }, { status: 500 })
  }
}

