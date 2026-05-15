import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withLeaderOrAdmin } from '@/lib/auth/withAuth'

export const dynamic = 'force-dynamic'

/** GET /api/admin/audit - List audit log entries. Admin only. Optional entityType, entityId. */
export const GET = withLeaderOrAdmin(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entityType') || undefined
    const entityId = searchParams.get('entityId') || undefined

    const where: { entityType?: string; entityId?: string } = {}
    if (entityType) where.entityType = entityType
    if (entityId) where.entityId = entityId

    const logs = await prisma.auditLog.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
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
