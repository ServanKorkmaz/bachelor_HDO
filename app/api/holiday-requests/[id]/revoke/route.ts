import { NextResponse } from 'next/server'
import { withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { revokeHoliday } from '@/lib/services/holiday-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** POST /api/holiday-requests/:id/revoke — revert an approved/rejected decision back to pending. */
export const POST = withLeaderOrAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    const result = await revokeHoliday(ctx.params.id, ctx.userId)
    return NextResponse.json(result)
  } catch (e) {
    const errRes = serviceErrorResponse(e)
    if (errRes) return errRes
    console.error('POST /api/holiday-requests/[id]/revoke', e)
    return NextResponse.json({ error: 'Failed to revoke decision' }, { status: 500 })
  }
})
