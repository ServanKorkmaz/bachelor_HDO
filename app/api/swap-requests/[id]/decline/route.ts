import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

/** Employee B declines a swap request → moves to REJECTED. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const currentUserId = await getCurrentUserId(request)
    if (!currentUserId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

    const sr = await prisma.swapRequest.findUnique({
      where: { id: params.id },
      include: { toUser: { select: { id: true, name: true } } },
    })
    if (!sr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (sr.status !== 'AWAITING_ACCEPTANCE') return NextResponse.json({ error: 'Forespørselen venter ikke på svar' }, { status: 400 })
    if (sr.toUserId !== currentUserId) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.swapRequest.update({
        where: { id: params.id },
        data: { status: 'REJECTED', decidedBy: currentUserId, decidedAt: new Date() },
      })
      await tx.notification.create({
        data: {
          teamId: sr.teamId,
          userId: sr.requestedByUserId,
          type: 'SWAP_REJECTED',
          title: 'Vaktbytte avslått',
          message: `${sr.toUser.name} avslo din vaktbytteforespørsel`,
        },
      })
      return u
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error declining swap request:', error)
    return NextResponse.json({ error: 'Failed to decline' }, { status: 500 })
  }
}
