import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

/** Employee B accepts a swap request → moves to PENDING for leader approval. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const currentUserId = await getCurrentUserId(request)
    if (!currentUserId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

    const sr = await prisma.swapRequest.findUnique({
      where: { id: params.id },
      include: {
        requestedBy: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    })
    if (!sr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (sr.status !== 'AWAITING_ACCEPTANCE') return NextResponse.json({ error: 'Forespørselen venter ikke på svar' }, { status: 400 })
    if (sr.toUserId !== currentUserId) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.swapRequest.update({
        where: { id: params.id },
        data: { status: 'PENDING' },
      })
      // Notify the requester that B accepted
      await tx.notification.create({
        data: {
          teamId: sr.teamId,
          userId: sr.requestedByUserId,
          type: 'SWAP_ACCEPTED_BY_COLLEAGUE',
          title: 'Kollega godtok vaktbytte',
          message: `${sr.toUser.name} godtok din vaktbytteforespørsel. Venter nå på leder.`,
        },
      })
      // Also notify team (no userId) so leader sees it
      await tx.notification.create({
        data: {
          teamId: sr.teamId,
          userId: null,
          type: 'SWAP_REQUESTED',
          title: 'Vaktbytte klar for godkjenning',
          message: `${sr.requestedBy.name} og ${sr.toUser.name} er enige om vaktbytte`,
        },
      })
      return u
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error accepting swap request:', error)
    return NextResponse.json({ error: 'Failed to accept' }, { status: 500 })
  }
}
