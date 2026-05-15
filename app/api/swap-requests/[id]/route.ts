import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { swapMessageSchema } from '@/lib/validation/schemas'

/** Cancel (delete) a swap request that is still open — only the requester can do this. */
export const DELETE = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const { id } = ctx.params

    const sr = await prisma.swapRequest.findUnique({ where: { id } })
    if (!sr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (sr.status !== 'PENDING' && sr.status !== 'AWAITING_ACCEPTANCE') {
      return NextResponse.json({ error: 'Kan bare avbestille forespørsler som ikke er behandlet ennå' }, { status: 400 })
    }
    if (sr.requestedByUserId !== ctx.userId) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })

    await prisma.swapRequest.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting swap request:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
})

/** Edit message on a PENDING swap request — only the requester can do this. */
export const PATCH = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const { id } = ctx.params

    const parsed = await parseJsonBody(request, swapMessageSchema)
    if ('error' in parsed) return parsed.error
    const { message } = parsed.data

    const sr = await prisma.swapRequest.findUnique({ where: { id } })
    if (!sr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (sr.status !== 'PENDING') return NextResponse.json({ error: 'Kan bare endre ventende forespørsler' }, { status: 400 })
    if (sr.requestedByUserId !== ctx.userId) return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 })

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
})
