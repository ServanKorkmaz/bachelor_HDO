import { prisma } from '@/lib/prisma'
import { createAuditLog, AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/lib/admin/audit'
import { ServiceError } from './errors'

/** A note attached to one specific (team, employee, ISO year, ISO week) cell. */
export interface WeekNoteInput {
  teamId: string
  /** The employee the note is *about*. */
  userId: string
  isoYear: number
  isoWeek: number
  /** Free-text body. Empty string is treated as "delete the note" since
   * there is no other way for callers to clear an existing entry. */
  body: string
  /** User performing the write; recorded for audit purposes. May differ from
   * `userId` when a leader writes a note on an employee's behalf. */
  actorUserId: string
}

export interface WeekRangeQuery {
  teamId: string
  /** Employee whose notes to list. */
  userId: string
  /** Inclusive lower bound. */
  fromYear: number
  fromWeek: number
  /** Inclusive upper bound. */
  toYear: number
  toWeek: number
}

/** Validate ISO week boundaries up-front so a typo doesn't reach the DB. */
function assertValidWeek(year: number, week: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new ServiceError('WEEK_NOTE_BAD_YEAR', 'Invalid ISO year', 400)
  }
  // ISO weeks are 1-53 (a long year has 53). Clamp at 53 here and let the
  // unique constraint reject any caller that creates a real conflict.
  if (!Number.isInteger(week) || week < 1 || week > 53) {
    throw new ServiceError('WEEK_NOTE_BAD_WEEK', 'Invalid ISO week', 400)
  }
}

/**
 * List week notes for a team in a (year, week) range. The Prisma query uses a
 * tuple comparison via two OR branches because we can't express "row(year,
 * week) BETWEEN tuple AND tuple" in Prisma's filter DSL directly — the
 * equivalent boolean form is:
 *   (year > fromYear) OR (year = fromYear AND week >= fromWeek)
 * combined with the upper-bound mirror. Cheap given the table is small.
 */
export async function listWeekNotes(query: WeekRangeQuery) {
  assertValidWeek(query.fromYear, query.fromWeek)
  assertValidWeek(query.toYear, query.toWeek)

  return prisma.weekNote.findMany({
    where: {
      teamId: query.teamId,
      userId: query.userId,
      AND: [
        {
          OR: [
            { isoYear: { gt: query.fromYear } },
            { isoYear: query.fromYear, isoWeek: { gte: query.fromWeek } },
          ],
        },
        {
          OR: [
            { isoYear: { lt: query.toYear } },
            { isoYear: query.toYear, isoWeek: { lte: query.toWeek } },
          ],
        },
      ],
    },
    orderBy: [{ isoYear: 'asc' }, { isoWeek: 'asc' }],
  })
}

/**
 * Idempotent upsert: write or update the single note for a (team, employee,
 * year, week) cell. Empty body deletes the row so the API surface stays
 * one-method instead of forcing the caller into a separate DELETE route. The
 * unique constraint on (teamId, userId, isoYear, isoWeek) makes this
 * race-safe.
 */
export async function upsertWeekNote(input: WeekNoteInput) {
  assertValidWeek(input.isoYear, input.isoWeek)
  const trimmed = input.body.trim()

  return prisma.$transaction(async (tx) => {
    if (trimmed.length === 0) {
      // Capture the row we're about to delete (if any) so the audit entry
      // records what existed before the clear — privileged-action accountability.
      const existing = await tx.weekNote.findUnique({
        where: {
          teamId_userId_isoYear_isoWeek: {
            teamId: input.teamId,
            userId: input.userId,
            isoYear: input.isoYear,
            isoWeek: input.isoWeek,
          },
        },
      })
      if (!existing) return null

      await tx.weekNote.delete({ where: { id: existing.id } })
      await createAuditLog(tx, {
        actorUserId: input.actorUserId,
        action: AUDIT_ACTION.WEEK_NOTE_DELETED,
        entityType: AUDIT_ENTITY_TYPE.WEEK_NOTE,
        entityId: existing.id,
        beforeJson: JSON.stringify({ body: existing.body, userId: existing.userId }),
        afterJson: null,
      })
      return null
    }

    const previous = await tx.weekNote.findUnique({
      where: {
        teamId_userId_isoYear_isoWeek: {
          teamId: input.teamId,
          userId: input.userId,
          isoYear: input.isoYear,
          isoWeek: input.isoWeek,
        },
      },
    })

    const note = await tx.weekNote.upsert({
      where: {
        teamId_userId_isoYear_isoWeek: {
          teamId: input.teamId,
          userId: input.userId,
          isoYear: input.isoYear,
          isoWeek: input.isoWeek,
        },
      },
      create: {
        teamId: input.teamId,
        userId: input.userId,
        isoYear: input.isoYear,
        isoWeek: input.isoWeek,
        body: trimmed,
        createdBy: input.actorUserId,
      },
      update: {
        body: trimmed,
      },
    })

    await createAuditLog(tx, {
      actorUserId: input.actorUserId,
      action: AUDIT_ACTION.WEEK_NOTE_UPSERTED,
      entityType: AUDIT_ENTITY_TYPE.WEEK_NOTE,
      entityId: note.id,
      beforeJson: previous ? JSON.stringify({ body: previous.body }) : null,
      afterJson: JSON.stringify({ body: note.body, userId: note.userId }),
    })

    return note
  })
}
