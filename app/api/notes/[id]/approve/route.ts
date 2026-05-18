import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { noteApproveSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'
import { decideNote } from '@/lib/services/note-service'
import { serviceErrorResponse } from '@/lib/services/errors'

/** Approve or reject a note by id and notify the creator. */
export const POST = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.notesApprove)
    if (limited) return limited

    const parsed = await parseJsonBody(request, noteApproveSchema)
    if ('error' in parsed) return parsed.error
    const { status } = parsed.data

    const existing = await prisma.note.findUnique({
      where: { id: ctx.params.id },
      select: { teamId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const forbidden = await assertTeamMember(ctx, existing.teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden

    const note = await decideNote(ctx.params.id, status as 'APPROVED' | 'REJECTED', ctx.userId)
    return NextResponse.json(note)
  } catch (error) {
    const mapped = serviceErrorResponse(error)
    if (mapped) return mapped
    console.error('Error updating note status:', error)
    return NextResponse.json({ error: 'Failed to update note status' }, { status: 500 })
  }
})
