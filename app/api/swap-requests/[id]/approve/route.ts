import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { createAuditLog, AUDIT_ENTITY_TYPE, AUDIT_ACTION } from '@/lib/admin/audit'

/** Approve a swap request by id and notify the requester. */
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
        requestedBy: true,
        fromUser: true,
        toUser: true,
        shift: true,
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

    const title = 'Vaktbytteforespørsel godkjent'
    const message = 'Din forespørsel om vaktbytte er godkjent'

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.swapRequest.update({
        where: { id: params.id },
        data: {
          status: 'APPROVED',
          decidedBy: currentUserId,
          decidedAt: new Date(),
        },
      })
      await tx.notification.create({
        data: {
          teamId: swapRequest.teamId,
          userId: swapRequest.requestedByUserId,
          type: 'SWAP_APPROVED',
          title,
          message,
        },
      })
      await createAuditLog(tx, {
        actorUserId: currentUserId,
        action: AUDIT_ACTION.SWAP_APPROVED,
        entityType: AUDIT_ENTITY_TYPE.SWAP_REQUEST,
        entityId: params.id,
        beforeJson: JSON.stringify({ status: 'PENDING' }),
        afterJson: JSON.stringify({
          status: 'APPROVED',
          decidedBy: currentUserId,
          fromUserId: swapRequest.fromUserId,
          toUserId: swapRequest.toUserId,
          shiftId: swapRequest.shiftId,
          shiftDate: swapRequest.shift.date,
        }),
      })
      return u
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

