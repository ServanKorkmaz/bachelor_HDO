import { Prisma, type NoteType, type RequestStatus, type NoteVisibility } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from '@/lib/notifications/deliver'
import { holidayTypeToNorwegian } from '@/lib/i18n'
import { ServiceError } from './errors'

const noteInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.NoteInclude

export type NoteWithRelations = Prisma.NoteGetPayload<{ include: typeof noteInclude }>
export type { NoteVisibility }

export interface CreateNoteInput {
  teamId: string
  createdByUserId: string
  type: NoteType
  status?: RequestStatus | null
  title?: string | null
  body: string
  dateFrom: string
  dateTo: string
  visibility: NoteVisibility
}

/**
 * Persist a note authored by `createdByUserId` and notify the author. The
 * visibility downgrade rule (EMPLOYEE can't post LEADERS-only) is enforced at
 * the route layer because it depends on the caller's system role, which is
 * already available there from `withAuth`.
 */
export async function createNote(input: CreateNoteInput): Promise<NoteWithRelations> {
  const note = await prisma.note.create({
    data: {
      teamId: input.teamId,
      createdByUserId: input.createdByUserId,
      type: input.type,
      status: input.status || 'PENDING',
      title: input.title || null,
      body: input.body,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      visibility: input.visibility,
    },
    include: noteInclude,
  })

  const notifTitle = 'Notat opprettet'
  const notifMessage = `Nytt notat opprettet: ${input.title || input.type}`
  await prisma.notification.create({
    data: {
      teamId: input.teamId,
      userId: input.createdByUserId,
      type: 'NOTE_CREATED',
      title: notifTitle,
      message: notifMessage,
    },
  })
  void deliverNotificationToChannels({
    userId: input.createdByUserId,
    teamId: input.teamId,
    type: 'NOTE_CREATED',
    title: notifTitle,
    message: notifMessage,
  })

  return note
}

/** Admin/leader approves or rejects a note and notifies the creator. */
export async function decideNote(
  noteId: string,
  status: 'APPROVED' | 'REJECTED'
): Promise<NoteWithRelations> {
  const existing = await prisma.note.findUnique({ where: { id: noteId } })
  if (!existing) {
    throw new ServiceError('NOTE_NOT_FOUND', 'Note not found', 404)
  }

  const note = await prisma.note.update({
    where: { id: noteId },
    data: { status },
    include: noteInclude,
  })

  const notifTitle = `Notat ${status === 'APPROVED' ? 'godkjent' : 'avvist'}`
  const typeNor = holidayTypeToNorwegian(note.type as string)
  const notifMessage = `Ditt notat "${note.title || typeNor}" er ${
    status === 'APPROVED' ? 'godkjent' : 'avvist'
  }`
  await prisma.notification.create({
    data: {
      teamId: note.teamId,
      userId: note.createdByUserId,
      type: 'NOTE_STATUS_CHANGED',
      title: notifTitle,
      message: notifMessage,
    },
  })
  void deliverNotificationToChannels({
    userId: note.createdByUserId,
    teamId: note.teamId,
    type: 'NOTE_STATUS_CHANGED',
    title: notifTitle,
    message: notifMessage,
  })

  return note
}
