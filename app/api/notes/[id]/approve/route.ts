import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { NoteStatus } from '@prisma/client'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { status } = body

    if (!status || !Object.values(NoteStatus).includes(status)) {
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

    // Create notification
    await prisma.notification.create({
      data: {
        teamId: note.teamId,
        userId: note.createdByUserId,
        type: 'NOTE_STATUS_CHANGED',
        title: `Notat ${status === 'APPROVED' ? 'godkjent' : 'avvist'}`,
        message: `Ditt notat "${note.title || note.type}" er ${status === 'APPROVED' ? 'godkjent' : 'avvist'}`,
      },
    })

    return NextResponse.json(note)
  } catch (error) {
    console.error('Error updating note status:', error)
    return NextResponse.json({ error: 'Failed to update note status' }, { status: 500 })
  }
}

