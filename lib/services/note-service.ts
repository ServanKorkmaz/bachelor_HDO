import { Prisma, type NoteType, type RequestStatus, type NoteVisibility } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { holidayTypeToNorwegian } from '@/lib/i18n'
import { withEvents } from '@/lib/notifications/events'
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
  return withEvents(async (tx, emit) => {
    const note = await tx.note.create({
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

    await emit({
      type: 'NOTE_CREATED',
      teamId: input.teamId,
      creatorUserId: input.createdByUserId,
      titleOrType: input.title || input.type,
    })

    return note
  })
}

/** Admin/leader approves or rejects a note and notifies the creator. */
export async function decideNote(
  noteId: string,
  status: 'APPROVED' | 'REJECTED'
): Promise<NoteWithRelations> {
  return withEvents(async (tx, emit) => {
    const existing = await tx.note.findUnique({ where: { id: noteId } })
    if (!existing) {
      throw new ServiceError('NOTE_NOT_FOUND', 'Note not found', 404)
    }

    const note = await tx.note.update({
      where: { id: noteId },
      data: { status },
      include: noteInclude,
    })

    const typeNor = holidayTypeToNorwegian(note.type as string)
    await emit({
      type: 'NOTE_DECIDED',
      teamId: note.teamId,
      creatorUserId: note.createdByUserId,
      titleOrType: note.title || typeNor,
      approved: status === 'APPROVED',
    })

    return note
  })
}
