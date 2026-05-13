import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { createAuditLog, AUDIT_ENTITY_TYPE, AUDIT_ACTION } from '@/lib/admin/audit'

/** Reject a swap request by id and notify the requester. */
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
      include: { shift: true },
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

    const title = 'Vaktbytteforespørsel avvist'
    const message = 'Din forespørsel om vaktbytte er avvist'

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.swapRequest.update({
        where: { id: params.id },
        data: {
          status: 'REJECTED',
          decidedBy: currentUserId,
          decidedAt: new Date(),
        },
      })
      await tx.notification.create({
        data: {
          teamId: swapRequest.teamId,
          userId: swapRequest.requestedByUserId,
          type: 'SWAP_REJECTED',
          title,
          message,
        },
      })
      await createAuditLog(tx, {
        actorUserId: currentUserId,
        action: AUDIT_ACTION.SWAP_REJECTED,
        entityType: AUDIT_ENTITY_TYPE.SWAP_REQUEST,
        entityId: params.id,
        beforeJson: JSON.stringify({ status: 'PENDING' }),
        afterJson: JSON.stringify({
          status: 'REJECTED',
          decidedBy: currentUserId,
          fromUserId: swapRequest.fromUserId,
          toUserId: swapRequest.toUserId,
          shiftId: swapRequest.shiftId,
          shiftDate: swapRequest.shift.date,
        }),
      })
      return u
    })

    void deliverNotificationToChannels({
      userId: swapRequest.requestedByUserId,
      teamId: swapRequest.teamId,
      type: 'SWAP_REJECTED',
      title,
      message,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error rejecting swap request:', error)
    return NextResponse.json({ error: 'Failed to reject swap request' }, { status: 500 })
  }
}

