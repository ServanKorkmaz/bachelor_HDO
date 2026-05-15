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
    return NextResponse.json(logs)
  } catch (e) {
    console.error('GET /api/admin/audit', e)
    return NextResponse.json(
      { error: 'Failed to fetch audit log' },
      { status: 500 }
    )
  }
})
