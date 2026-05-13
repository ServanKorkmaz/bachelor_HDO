import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/withAuth'
import { rejectSwap } from '@/lib/services/swap-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** Reject a swap request by id and notify the requester. */
export const POST = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const updated = await rejectSwap(ctx.params.id, ctx.userId)
    return NextResponse.json(updated)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error rejecting swap request:', error)
    return NextResponse.json({ error: 'Failed to reject swap request' }, { status: 500 })
  }
})
