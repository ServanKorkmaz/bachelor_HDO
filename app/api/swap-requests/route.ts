import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { swapCreateSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { createSwap } from '@/lib/services/swap-service'
import { serviceErrorResponse } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

/** List swap requests for a team. */
export const GET = withAuth(async (request, ctx) => {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const forbidden = await assertTeamMember(ctx, teamId)
    if (forbidden) return forbidden

    const swapRequests = await prisma.swapRequest.findMany({
      where: { teamId },
      include: {
        requestedBy: { select: { id: true, name: true } },
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        shift: { include: { shiftType: true } },
        toShift: { include: { shiftType: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(swapRequests)
  } catch (error) {
    console.error('Error fetching swap requests:', error)
    return NextResponse.json({ error: 'Failed to fetch swap requests' }, { status: 500 })
  }
})

/** Create a swap request and notify the recipient. */
export const POST = withAuth(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.swapWrite)
    if (limited) return limited

    const parsed = await parseJsonBody(request, swapCreateSchema)
    if ('error' in parsed) return parsed.error
    const { teamId, shiftId, toShiftId, toUserId, message } = parsed.data

    const forbidden = await assertTeamMember(ctx, teamId)
    if (forbidden) return forbidden

    const swapRequest = await createSwap({
      teamId,
      // requestedByUserId always comes from the authenticated caller — never trust the body
      requestedByUserId: ctx.userId,
      shiftId,
      toShiftId,
      toUserId,
      message,
    })

    return NextResponse.json(swapRequest)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error creating swap request:', error)
    return NextResponse.json({ error: 'Failed to create swap request' }, { status: 500 })
  }
})
