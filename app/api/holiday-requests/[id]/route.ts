import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/admin/audit'
import { holidayTypeToNorwegian, statusToNorwegian } from '@/lib/i18n'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

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

    const currentUserId = await getCurrentUserId(request)
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

      const typeNor = holidayTypeToNorwegian(res.type)
      const statusNor = statusToNorwegian(newStatus)
      await tx.notification.create({
        data: {
          teamId: res.teamId,
          userId: res.userId,
          type: 'HOLIDAY_DECIDED',
          title: `Forespørsel ${statusNor}`,
          message: `Din ${typeNor}-forespørsel ble ${statusNor.toLowerCase()}`,
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

/** Edit a PENDING holiday request — only the owner can do this. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { type, dateFrom, dateTo, message } = body
    const currentUserId = await getCurrentUserId(request)

    const hr = await prisma.holidayRequest.findUnique({ where: { id } })
    if (!hr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (hr.status !== 'PENDING') return NextResponse.json({ error: 'Kan bare endre ventende forespørsler' }, { status: 400 })
    if (currentUserId && hr.userId !== currentUserId) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })

    if (!type || !dateFrom) return NextResponse.json({ error: 'type og dateFrom er påkrevd' }, { status: 400 })

    const updated = await prisma.holidayRequest.update({
      where: { id },
      data: { type, dateFrom, dateTo: dateTo || null, message: message || null },
      include: { user: { select: { id: true, name: true } } },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating holiday request:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

/** Cancel (delete) a PENDING holiday request — only the owner can do this. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const currentUserId = await getCurrentUserId(request)

    const hr = await prisma.holidayRequest.findUnique({ where: { id } })
    if (!hr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (hr.status !== 'PENDING') {
      return NextResponse.json({ error: 'Kan bare avbestille ventende forespørsler' }, { status: 400 })
    }

    if (currentUserId && hr.userId !== currentUserId) {
      return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })
    }

    await prisma.holidayRequest.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting holiday request:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
