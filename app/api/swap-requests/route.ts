import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog, AUDIT_ENTITY_TYPE, AUDIT_ACTION } from '@/lib/admin/audit'
import { requireTeamMembership } from '@/lib/auth/requireTeamMembership'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { swapCreateSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/** List swap requests for a team. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const auth = await requireTeamMembership(request, teamId)
    if ('error' in auth) return auth.error

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
    const parsed = await parseJsonBody(request, swapCreateSchema)
    if ('error' in parsed) return parsed.error
    const { teamId, shiftId, toUserId, message } = parsed.data

    const auth = await requireTeamMembership(request, teamId)
    if ('error' in auth) return auth.error
    // requestedByUserId always comes from the authenticated caller — never trust the body
    const requestedByUserId = auth.userId

    // Get the shift to find the fromUserId
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
    })

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }

    const swapRequest = await prisma.$transaction(async (tx) => {
      const sr = await tx.swapRequest.create({
        data: {
          teamId,
          requestedByUserId,
          fromUserId: shift.userId,
          toUserId,
          shiftId,
          status: 'AWAITING_ACCEPTANCE',
          message: message || null,
        },
        include: {
          requestedBy: { select: { id: true, name: true } },
          fromUser: { select: { id: true, name: true } },
          toUser: { select: { id: true, name: true } },
          shift: { include: { shiftType: true } },
        },
      })
      await tx.notification.create({
        data: {
          teamId,
          userId: toUserId,  // notify B specifically
          type: 'SWAP_REQUESTED',
          title: 'Vaktbytteforespørsel',
          message: `${sr.requestedBy.name} ønsker å bytte vakt med deg`,
        },
      })
      const afterJson = JSON.stringify({
        fromUserId: sr.fromUserId,
        toUserId: sr.toUserId,
        shiftId: sr.shiftId,
        shiftDate: sr.shift.date,
      })
      await createAuditLog(tx, {
        actorUserId: requestedByUserId,
        action: AUDIT_ACTION.SWAP_REQUESTED,
        entityType: AUDIT_ENTITY_TYPE.SWAP_REQUEST,
        entityId: sr.id,
        afterJson,
      })
      return sr
    })

    return NextResponse.json(swapRequest)
  } catch (error) {
    console.error('Error creating swap request:', error)
    return NextResponse.json({ error: 'Failed to create swap request' }, { status: 500 })
  }
}

