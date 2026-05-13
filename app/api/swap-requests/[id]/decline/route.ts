import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/withAuth'
import { declineSwap } from '@/lib/services/swap-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** Employee B declines a swap request → moves to REJECTED. */
export const POST = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const updated = await declineSwap(ctx.params.id, ctx.userId)
    return NextResponse.json(updated)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error declining swap request:', error)
    return NextResponse.json({ error: 'Failed to decline' }, { status: 500 })
  }
})
