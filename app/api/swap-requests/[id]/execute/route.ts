import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withLeaderOrAdmin } from '@/lib/auth/withAuth'
import { executeSwap } from '@/lib/services/swap-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** Execute an approved swap request and notify both users. Admin, or a
 *  leader of the swap's team. */
export const POST = withLeaderOrAdmin<{ id: string }>(async (_request, ctx) => {
  try {
    const sr = await prisma.swapRequest.findUnique({
      where: { id: ctx.params.id },
      select: { teamId: true },
    })
    if (!sr) return NextResponse.json({ error: 'Swap request not found' }, { status: 404 })
    const forbidden = await assertTeamMember(ctx, sr.teamId, ['LEADER', 'ADMIN'])
    if (forbidden) return forbidden

    const updated = await executeSwap(ctx.params.id, ctx.userId)
    return NextResponse.json(updated)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error executing swap request:', error)
    return NextResponse.json({ error: 'Failed to execute swap request' }, { status: 500 })
  }
})
