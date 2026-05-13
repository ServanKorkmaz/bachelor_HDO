import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/withAuth'
import { approveSwap } from '@/lib/services/swap-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** Approve a swap request by id and notify the requester. */
export const POST = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const updated = await approveSwap(ctx.params.id, ctx.userId)
    return NextResponse.json(updated)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error approving swap request:', error)
    return NextResponse.json({ error: 'Failed to approve swap request' }, { status: 500 })
  }
})
