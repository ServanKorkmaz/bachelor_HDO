import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'

const VALID_NOTE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const

/** Approve or reject a note by id and notify the creator. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { status } = body

    if (!status || !VALID_NOTE_STATUSES.includes(status as any)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

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
    const notifMessage = `Ditt notat "${note.title || note.type}" er ${status === 'APPROVED' ? 'godkjent' : 'avvist'}`
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

