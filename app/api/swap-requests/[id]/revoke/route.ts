import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { revokeSwap } from '@/lib/services/swap-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** POST /api/swap-requests/:id/revoke. Revert an approved/rejected decision
 *  back to pending. Admin, or a leader of the swap's team. */
export const POST = withLeaderOrAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    const sr = await prisma.swapRequest.findUnique({
      where: { id: ctx.params.id },
      select: { teamId: true },
    })
    if (!sr) return NextResponse.json({ error: 'Swap request not found' }, { status: 404 })
    const forbidden = await assertTeamMember(ctx, sr.teamId, ['LEADER', 'ADMIN'])
    if (forbidden) return forbidden

    const updated = await revokeSwap(ctx.params.id, ctx.userId)
    return NextResponse.json(updated)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('POST /api/swap-requests/[id]/revoke', error)
    return NextResponse.json({ error: 'Failed to revoke decision' }, { status: 500 })
  }
})
