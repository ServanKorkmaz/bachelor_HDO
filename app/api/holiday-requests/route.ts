import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/admin/audit'

/** List holiday / absence requests for a team. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const items = await prisma.holidayRequest.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, name: true } },
        decidedByUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(items)
  } catch (error) {
    console.error('Error fetching holiday requests:', error)
    return NextResponse.json({ error: 'Failed to fetch holiday requests' }, { status: 500 })
  }
}

/** Create a holiday / absence request. */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { teamId, userId, type, dateFrom, dateTo, message } = body

    if (!teamId || !userId || !type || !dateFrom) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

  const created = await prisma.$transaction(async (tx: any) => {
      const hr = await tx.holidayRequest.create({
        data: {
          teamId,
          userId,
          type,
          status: 'PENDING',
          dateFrom,
          dateTo: dateTo || null,
          message: message || null,
        },
        include: { user: { select: { id: true, name: true } } },
      })

      await tx.notification.create({
        data: {
          teamId,
          userId: null,
          type: 'HOLIDAY_REQUESTED',
          title: 'New holiday/absence request',
          message: `${hr.user.name} submitted a ${type.toLowerCase()} request`,
        },
      })

      await createAuditLog(tx, {
        actorUserId: userId,
        action: 'HOLIDAY_REQUESTED',
        entityType: 'holiday_request',
        entityId: hr.id,
        afterJson: JSON.stringify({ type, dateFrom, dateTo }),
      })

      return hr
    })

    return NextResponse.json(created)
  } catch (error) {
    console.error('Error creating holiday request:', error)
    return NextResponse.json({ error: 'Failed to create holiday request' }, { status: 500 })
  }
}
