import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { revokeHoliday } from '@/lib/services/holiday-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** POST /api/holiday-requests/:id/revoke. Revert an approved/rejected
 *  decision back to pending. Admin, or a leader of the request's team. */
export const POST = withLeaderOrAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    const hr = await prisma.holidayRequest.findUnique({
      where: { id: ctx.params.id },
      select: { teamId: true },
    })
    if (!hr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const forbidden = await assertTeamMember(ctx, hr.teamId, ['LEADER', 'ADMIN'])
    if (forbidden) return forbidden

    const result = await revokeHoliday(ctx.params.id, ctx.userId)
    return NextResponse.json(result)
  } catch (e) {
    const errRes = serviceErrorResponse(e)
    if (errRes) return errRes
    console.error('POST /api/holiday-requests/[id]/revoke', e)
    return NextResponse.json({ error: 'Failed to revoke decision' }, { status: 500 })
  }
})
