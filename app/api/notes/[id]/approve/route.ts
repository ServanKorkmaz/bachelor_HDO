import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { holidayTypeToNorwegian } from '@/lib/i18n'
import { requireTeamMembership } from '@/lib/auth/requireTeamMembership'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { noteApproveSchema } from '@/lib/validation/schemas'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { RATE_LIMITS } from '@/lib/security/rateLimitConfigs'

/** Approve or reject a note by id and notify the creator. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const limited = applyRateLimit(request, RATE_LIMITS.notesApprove)
    if (limited) return limited

    const parsed = await parseJsonBody(request, noteApproveSchema)
    if ('error' in parsed) return parsed.error
    const { status } = parsed.data

    const existing = await prisma.note.findUnique({
      where: { id: params.id },
      select: { teamId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    // Only ADMIN/LEADER of the note's team may approve/reject
    const auth = await requireTeamMembership(request, existing.teamId, ['ADMIN', 'LEADER'])
    if ('error' in auth) return auth.error

    const note = await prisma.note.update({
      where: { id: params.id },
      data: { status },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    const notifTitle = `Notat ${status === 'APPROVED' ? 'godkjent' : 'avvist'}`
  const typeNor = holidayTypeToNorwegian(note.type as string)
  const notifMessage = `Ditt notat "${note.title || typeNor}" er ${status === 'APPROVED' ? 'godkjent' : 'avvist'}`
    await prisma.notification.create({
      data: {
        teamId: note.teamId,
        userId: note.createdByUserId,
        type: 'NOTE_STATUS_CHANGED',
        title: notifTitle,
        message: notifMessage,
      },
    })
    deliverNotificationToChannels({
      userId: note.createdByUserId,
      teamId: note.teamId,
      type: 'NOTE_STATUS_CHANGED',
      title: notifTitle,
      message: notifMessage,
    }).catch(console.error)

    return NextResponse.json(note)
  } catch (error) {
    console.error('Error updating note status:', error)
    return NextResponse.json({ error: 'Failed to update note status' }, { status: 500 })
  }
}

