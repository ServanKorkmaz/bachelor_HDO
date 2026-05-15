import { NextResponse } from 'next/server'
import { withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { executeSwap } from '@/lib/services/swap-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** Execute an approved swap request and notify both users. Leader or admin only. */
export const POST = withLeaderOrAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    const updated = await executeSwap(ctx.params.id, ctx.userId)
    return NextResponse.json(updated)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error executing swap request:', error)
    return NextResponse.json({ error: 'Failed to execute swap request' }, { status: 500 })
  }
})
