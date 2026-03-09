import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/admin/audit'

/** Get a single holiday request or update its status (approve/reject). */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const hr = await prisma.holidayRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true } }, decidedByUser: { select: { id: true, name: true } } },
    })
    if (!hr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(hr)
  } catch (error) {
    console.error('Error fetching holiday request:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { action } = body // action: 'APPROVE' | 'REJECT'

    if (!action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Prefer authenticated approver
    const currentUserId = await (await import('@/lib/auth/getCurrentUserId')).getCurrentUserId(request)
    if (!currentUserId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const hr = await tx.holidayRequest.findUnique({ where: { id } })
      if (!hr) throw new Error('Not found')

      const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

      const res = await tx.holidayRequest.update({
        where: { id },
        data: { status: newStatus, decidedBy: currentUserId, decidedAt: new Date() },
        include: { user: { select: { id: true, name: true } } },
      })

      await tx.notification.create({
        data: {
          teamId: res.teamId,
          userId: res.userId,
          type: 'HOLIDAY_DECIDED',
          title: `Forespørsel ${newStatus.toLowerCase()}`,
          message: `Din ${res.type.toLowerCase()}-forespørsel ble ${newStatus.toLowerCase()}`,
        },
      })

      await createAuditLog(tx, {
        actorUserId: currentUserId,
        action: action === 'APPROVE' ? 'HOLIDAY_APPROVED' : 'HOLIDAY_REJECTED',
        entityType: 'holiday_request',
        entityId: id,
        beforeJson: JSON.stringify(hr),
        afterJson: JSON.stringify(res),
      })

      return res
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating holiday request:', error)
    return NextResponse.json({ error: (error as Error).message || 'Failed to update' }, { status: 500 })
  }
}
