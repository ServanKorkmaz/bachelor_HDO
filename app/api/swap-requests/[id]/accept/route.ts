import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/withAuth'
import { acceptSwap } from '@/lib/services/swap-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** Employee B accepts a swap request → moves to PENDING for leader approval. */
export const POST = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const updated = await acceptSwap(ctx.params.id, ctx.userId)
    return NextResponse.json(updated)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error accepting swap request:', error)
    return NextResponse.json({ error: 'Failed to accept' }, { status: 500 })
  }
})
