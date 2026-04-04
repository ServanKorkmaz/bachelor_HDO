import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

/** Cancel (delete) a PENDING swap request — only the requester can do this. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const currentUserId = await getCurrentUserId(request)

    const sr = await prisma.swapRequest.findUnique({ where: { id } })
    if (!sr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (sr.status !== 'PENDING') return NextResponse.json({ error: 'Kan bare avbestille ventende forespørsler' }, { status: 400 })
    if (currentUserId && sr.requestedByUserId !== currentUserId) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })

    await prisma.swapRequest.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting swap request:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}

/** Edit message on a PENDING swap request — only the requester can do this. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { message } = body
    const currentUserId = await getCurrentUserId(request)

    const sr = await prisma.swapRequest.findUnique({ where: { id } })
    if (!sr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (sr.status !== 'PENDING') return NextResponse.json({ error: 'Kan bare endre ventende forespørsler' }, { status: 400 })
    if (currentUserId && sr.requestedByUserId !== currentUserId) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })

    const updated = await prisma.swapRequest.update({
      where: { id },
      data: { message: message || null },
      include: {
        shift: { include: { shiftType: true } },
        fromUser: true,
        toUser: true,
        requestedBy: true,
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error patching swap request:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
