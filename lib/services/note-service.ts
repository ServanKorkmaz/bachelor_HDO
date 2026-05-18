import { Prisma, type NoteType, type RequestStatus, type NoteVisibility } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAuditLog, AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/lib/admin/audit'
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

    await createAuditLog(tx, {
      actorUserId: input.createdByUserId,
      action: AUDIT_ACTION.NOTE_CREATED,
      entityType: AUDIT_ENTITY_TYPE.NOTE,
      entityId: note.id,
      beforeJson: null,
      afterJson: JSON.stringify({
        teamId: note.teamId,
        type: note.type,
        visibility: note.visibility,
        dateFrom: note.dateFrom,
        dateTo: note.dateTo,
      }),
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
  status: 'APPROVED' | 'REJECTED',
  actorUserId: string
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

    await createAuditLog(tx, {
      actorUserId,
      action: status === 'APPROVED' ? AUDIT_ACTION.NOTE_APPROVED : AUDIT_ACTION.NOTE_REJECTED,
      entityType: AUDIT_ENTITY_TYPE.NOTE,
      entityId: note.id,
      beforeJson: JSON.stringify({ status: existing.status }),
      afterJson: JSON.stringify({ status: note.status }),
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
