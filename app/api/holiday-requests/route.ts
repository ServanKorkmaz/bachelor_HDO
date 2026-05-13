import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { holidayCreateSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { createHoliday } from '@/lib/services/holiday-service'
import { serviceErrorResponse } from '@/lib/services/errors'

export const dynamic = 'force-dynamic'

/** List holiday / absence requests for a team. */
export const GET = withAuth(async (request, ctx) => {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const forbidden = await assertTeamMember(ctx, teamId)
    if (forbidden) return forbidden

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
})

/** Submit a holiday / absence request for the authenticated caller. */
export const POST = withAuth(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.holidayWrite)
    if (limited) return limited

    const parsed = await parseJsonBody(request, holidayCreateSchema)
    if ('error' in parsed) return parsed.error
    const { type, dateFrom, dateTo, message } = parsed.data

    // userId/teamId always derived from the authenticated caller — body
    // values are ignored to prevent submitting on someone else's behalf.
    const u = await prisma.user.findUnique({ where: { id: ctx.userId } })
    if (!u) return NextResponse.json({ error: 'Current user not found' }, { status: 404 })

    const created = await createHoliday({
      teamId: u.teamId,
      userId: u.id,
      type,
      dateFrom,
      dateTo,
      message,
    })

    return NextResponse.json(created)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error creating holiday request:', error)
    return NextResponse.json({ error: 'Failed to create holiday request' }, { status: 500 })
  }
})
