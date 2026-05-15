import { NextResponse } from 'next/server'
import { withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { revokeSwap } from '@/lib/services/swap-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** POST /api/swap-requests/:id/revoke — revert an approved/rejected decision back to pending. */
export const POST = withLeaderOrAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    const updated = await revokeSwap(ctx.params.id, ctx.userId)
    return NextResponse.json(updated)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('POST /api/swap-requests/[id]/revoke', error)
    return NextResponse.json({ error: 'Failed to revoke decision' }, { status: 500 })
  }
})
