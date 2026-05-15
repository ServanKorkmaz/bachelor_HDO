import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withLeaderOrAdmin } from '@/lib/auth/withAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/audit
 *
 * List audit log entries. Admin/leader only.
 *
 * Query params (all optional):
 *   - entityType: filter by entity type (`user`, `swap_request`, ...)
 *   - entityId: filter by a specific entity
 *   - dateFrom: ISO date (YYYY-MM-DD), inclusive
 *   - dateTo:   ISO date (YYYY-MM-DD), inclusive (interpreted as end-of-day)
 */
export const GET = withLeaderOrAdmin(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entityType') || undefined
    const entityId = searchParams.get('entityId') || undefined
    const dateFrom = searchParams.get('dateFrom') || undefined
    const dateTo = searchParams.get('dateTo') || undefined

    const where: Prisma.AuditLogWhereInput = {}
    if (entityType) where.entityType = entityType
    if (entityId) where.entityId = entityId
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`)
      // Inclusive end-of-day so a "to=2026-05-15" filter includes events at 23:59.
      if (dateTo) where.createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`)
    }

    const logs = await prisma.auditLog.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })

    // Live-entity enrichment. Audit rows are written with a snapshot of the
    // fields the display layer needs, but older rows pre-date this and only
    // contain `{ status }` — and rather than rewriting append-only audit
    // data (which would be wrong), we join with the live entity at read time
    // so the UI can show "Anne Berg → Ingrid Larsen, 13.05.2026" instead of
    // "(uten detaljer)". If the entity has been deleted, no enrichment is
    // attached and the page falls back to the snapshot (which is the right
    // behaviour — the historical record is the source of truth).
    const swapIds = new Set<string>()
    const holidayIds = new Set<string>()
    for (const log of logs) {
      if (log.entityType === 'swap_request') swapIds.add(log.entityId)
      else if (log.entityType === 'holiday_request') holidayIds.add(log.entityId)
    }

    const [swaps, holidays] = await Promise.all([
      swapIds.size > 0
        ? prisma.swapRequest.findMany({
            where: { id: { in: Array.from(swapIds) } },
            select: {
              id: true,
              fromUserId: true,
              toUserId: true,
              shift: { select: { date: true } },
            },
          })
        : Promise.resolve([]),
      holidayIds.size > 0
        ? prisma.holidayRequest.findMany({
            where: { id: { in: Array.from(holidayIds) } },
            select: { id: true, userId: true, type: true, dateFrom: true, dateTo: true },
          })
        : Promise.resolve([]),
    ])

    const swapById = new Map(
      swaps.map((s) => [
        s.id,
        {
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
          shiftDate: s.shift.date,
        },
      ]),
    )
    const holidayById = new Map(
      holidays.map((h) => [
        h.id,
        {
          userId: h.userId,
          type: h.type,
          dateFrom: h.dateFrom,
          dateTo: h.dateTo,
        },
      ]),
    )

    const enriched = logs.map((log) => ({
      ...log,
      entitySnapshot:
        log.entityType === 'swap_request'
          ? swapById.get(log.entityId) ?? null
          : log.entityType === 'holiday_request'
            ? holidayById.get(log.entityId) ?? null
            : null,
    }))

    return NextResponse.json(enriched)
  } catch (e) {
    console.error('GET /api/admin/audit', e)
    return NextResponse.json(
      { error: 'Failed to fetch audit log' },
      { status: 500 }
    )
  }
})
