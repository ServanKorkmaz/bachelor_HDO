import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { holidayPatchSchema, holidayPutSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { decideHoliday } from '@/lib/services/holiday-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** Get a single holiday request. Caller must be a member of its team. */
export const GET = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const hr = await prisma.holidayRequest.findUnique({
      where: { id: ctx.params.id },
      include: { user: { select: { id: true, name: true } }, decidedByUser: { select: { id: true, name: true } } },
    })
    if (!hr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const forbidden = await assertTeamMember(ctx, hr.teamId)
    if (forbidden) return forbidden

    return NextResponse.json(hr)
  } catch (error) {
    console.error('Error fetching holiday request:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
})

/** Approve or reject a holiday request — leaders/admins of its team only. */
export const PATCH = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.holidayWrite)
    if (limited) return limited

    const parsed = await parseJsonBody(request, holidayPatchSchema)
    if ('error' in parsed) return parsed.error
    const { action } = parsed.data

    const existing = await prisma.holidayRequest.findUnique({
      where: { id: ctx.params.id },
      select: { teamId: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const forbidden = await assertTeamMember(ctx, existing.teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden

    const updated = await decideHoliday(ctx.params.id, ctx.userId, action)
    return NextResponse.json(updated)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error updating holiday request:', error)
    return NextResponse.json({ error: (error as Error).message || 'Failed to update' }, { status: 500 })
  }
})

/** Edit a PENDING holiday request — only the owner can do this. */
export const PUT = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.holidayWrite)
    if (limited) return limited

    const parsed = await parseJsonBody(request, holidayPutSchema)
    if ('error' in parsed) return parsed.error
    const { type, dateFrom, dateTo, message } = parsed.data

    const hr = await prisma.holidayRequest.findUnique({ where: { id: ctx.params.id } })
    if (!hr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (hr.status !== 'PENDING') return NextResponse.json({ error: 'Kan bare endre ventende forespørsler' }, { status: 400 })
    if (hr.userId !== ctx.userId) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })

    const updated = await prisma.holidayRequest.update({
      where: { id: ctx.params.id },
      data: { type, dateFrom, dateTo: dateTo || null, message: message || null },
      include: { user: { select: { id: true, name: true } } },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating holiday request:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
})

/** Cancel (delete) a PENDING holiday request — only the owner can do this. */
export const DELETE = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.holidayWrite)
    if (limited) return limited

    const hr = await prisma.holidayRequest.findUnique({ where: { id: ctx.params.id } })
    if (!hr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (hr.status !== 'PENDING') {
      return NextResponse.json({ error: 'Kan bare avbestille ventende forespørsler' }, { status: 400 })
    }

    if (hr.userId !== ctx.userId) {
      return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })
    }

    await prisma.holidayRequest.delete({ where: { id: ctx.params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting holiday request:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
})
