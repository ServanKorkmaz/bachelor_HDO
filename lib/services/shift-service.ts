import { Prisma } from '@prisma/client'
import { format, parseISO, subDays, addDays } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { buildShiftDateTimes, ShiftTimeError } from '@/lib/shifts/time'
import { withEvents } from '@/lib/notifications/events'
import { evaluateShiftIssues, type Conflict } from '@/lib/domain/shift-issues'
import { ServiceError } from './errors'

/**
 * Placeholder id used as the target for AML evaluation in a CREATE flow,
 * before the row has been inserted and assigned a real cuid. Any string that
 * cannot collide with a real cuid works — the only thing the evaluator does
 * with target.id is filter it out of the "other shifts" list, and that list
 * doesn't contain this placeholder either.
 */
const CREATE_TARGET_ID = '__create_pending__'

/**
 * Look up the user's nearby shifts and active approved holidays, then run the
 * AML §10-8 evaluator. Throws a typed ServiceError when a hard conflict is
 * detected. Runs inside the surrounding transaction so the validation is
 * serialised with the write — no TOCTOU window where two parallel callers
 * each see "clean" and both insert a violating shift.
 *
 * The 14-day window is deliberately wider than the 7-day rolling window the
 * evaluator needs: covers the streak probe and absorbs end-of-window edge
 * cases without forcing per-call windowing logic here.
 */
async function assertNoAmlConflict(
  tx: Prisma.TransactionClient,
  args: {
    targetId: string
    userId: string
    date: string
    startDateTime: Date
    endDateTime: Date
  }
): Promise<void> {
  const parsedDate = parseISO(args.date)
  const windowFrom = format(subDays(parsedDate, 14), 'yyyy-MM-dd')
  const windowTo = format(addDays(parsedDate, 1), 'yyyy-MM-dd')

  const [otherShifts, holidays] = await Promise.all([
    tx.shift.findMany({
      where: {
        userId: args.userId,
        date: { gte: windowFrom, lte: windowTo },
        NOT: { id: args.targetId },
      },
      select: { id: true, date: true, startDateTime: true, endDateTime: true },
    }),
    tx.holidayRequest.findMany({
      where: {
        userId: args.userId,
        status: 'APPROVED',
        dateFrom: { lte: args.date },
        OR: [
          { AND: [{ dateTo: null }, { dateFrom: args.date }] },
          { dateTo: { gte: args.date } },
        ],
      },
      select: { id: true, dateFrom: true, dateTo: true },
    }),
  ])

  const issues = evaluateShiftIssues(
    {
      id: args.targetId,
      date: args.date,
      startDateTime: args.startDateTime,
      endDateTime: args.endDateTime,
    },
    otherShifts,
    holidays
  )

  if (issues.hardConflict) {
    throw amlError(issues.hardConflict)
  }
}

function amlError(c: Conflict): ServiceError {
  switch (c.kind) {
    case 'Holiday':
      return new ServiceError(
        'AML_HOLIDAY',
        'Brukeren har godkjent fravær på denne datoen.',
        422
      )
    case 'Overlap':
      return new ServiceError(
        'AML_OVERLAP',
        'Vakten overlapper i tid med en annen vakt brukeren har.',
        422
      )
    case 'RestPeriod':
      return new ServiceError(
        'AML_DAILY_REST',
        `For lite hvile mellom vakter — kun ${c.hoursBetween} timer (AML §10-8(1) krever 11).`,
        422
      )
    case 'WeeklyRest':
      return new ServiceError(
        'AML_WEEKLY_REST',
        `For lite ukentlig hvile — lengste sammenhengende hvile er ${c.hoursInWindow} timer (AML §10-8(2) krever 35).`,
        422
      )
  }
}

const shiftInclude = {
  shiftType: true,
  user: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ShiftInclude

export type ShiftWithRelations = Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>

/** Minimal shape needed to compute datetimes; bulk passes pre-fetched rows here. */
type ShiftTypeForTimes = { crossesMidnight: boolean }

export interface CreateShiftInput {
  teamId: string
  userId: string
  date: string
  shiftTypeId: string
  startTime: string
  endTime: string
  comment?: string | null
  /**
   * Optional pre-fetched shift type. When provided the service skips its own
   * lookup — used by the bulk route to avoid N round-trips for the same set
   * of shift-type ids.
   */
  shiftType?: ShiftTypeForTimes
}

export interface UpdateShiftInput {
  userId: string
  date: string
  shiftTypeId: string
  startTime: string
  endTime: string
  comment?: string | null
  shiftType?: ShiftTypeForTimes
}

/** Lookup a shift type or throw a typed not-found error. */
async function loadShiftType(shiftTypeId: string, preloaded?: ShiftTypeForTimes) {
  if (preloaded) return preloaded
  const shiftType = await prisma.shiftType.findUnique({ where: { id: shiftTypeId } })
  if (!shiftType) {
    throw new ServiceError('SHIFT_TYPE_NOT_FOUND', 'Shift type not found', 404)
  }
  return shiftType
}

/** Build datetimes for a shift, translating ShiftTimeError into a domain error. */
function resolveTimes(args: {
  date: string
  startTime: string
  endTime: string
  shiftType: { crossesMidnight: boolean }
}) {
  try {
    return buildShiftDateTimes(args)
  } catch (e) {
    if (e instanceof ShiftTimeError) {
      throw new ServiceError('INVALID_TIME', e.message, 400)
    }
    throw e
  }
}

/** Map Prisma's unique-constraint code to a domain duplicate error. */
function translateUniqueViolation(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw new ServiceError(
      'DUPLICATE_SHIFT',
      'Brukeren har allerede en vakt på denne datoen',
      409
    )
  }
  throw e
}

/** Create a shift, then notify the assigned user. */
export async function createShift(input: CreateShiftInput): Promise<ShiftWithRelations> {
  const shiftType = await loadShiftType(input.shiftTypeId, input.shiftType)
  const { startDateTime, endDateTime } = resolveTimes({
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType,
  })

  return withEvents(async (tx, emit) => {
    await assertNoAmlConflict(tx, {
      targetId: CREATE_TARGET_ID,
      userId: input.userId,
      date: input.date,
      startDateTime,
      endDateTime,
    })

    let shift: ShiftWithRelations
    try {
      shift = await tx.shift.create({
        data: {
          teamId: input.teamId,
          userId: input.userId,
          date: input.date,
          startDateTime,
          endDateTime,
          shiftTypeId: input.shiftTypeId,
          comment: input.comment || null,
        },
        include: shiftInclude,
      })
    } catch (e) {
      translateUniqueViolation(e)
    }

    await emit({
      type: 'SHIFT_CREATED',
      teamId: shift.teamId,
      assigneeUserId: shift.userId,
      assigneeName: shift.user.name,
      date: input.date,
    })

    return shift
  })
}

/**
 * Update an already-loaded shift and notify the previous assignee. Caller is
 * expected to have fetched `existing` for the auth check; passing it in avoids
 * a redundant lookup and keeps the recipient stable across a reassignment.
 */
export async function updateShift(
  existing: { id: string; teamId: string; userId: string },
  input: UpdateShiftInput
): Promise<ShiftWithRelations> {
  const shiftType = await loadShiftType(input.shiftTypeId, input.shiftType)
  const { startDateTime, endDateTime } = resolveTimes({
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType,
  })

  return withEvents(async (tx, emit) => {
    await assertNoAmlConflict(tx, {
      targetId: existing.id,
      userId: input.userId,
      date: input.date,
      startDateTime,
      endDateTime,
    })

    let shift: ShiftWithRelations
    try {
      shift = await tx.shift.update({
        where: { id: existing.id },
        data: {
          userId: input.userId,
          date: input.date,
          startDateTime,
          endDateTime,
          shiftTypeId: input.shiftTypeId,
          comment: input.comment || null,
        },
        include: shiftInclude,
      })
    } catch (e) {
      translateUniqueViolation(e)
    }

    await emit({
      type: 'SHIFT_UPDATED',
      teamId: existing.teamId,
      assigneeUserId: existing.userId,
      assigneeName: shift.user.name,
      date: input.date,
    })

    return shift
  })
}

/** Delete an already-loaded shift and notify the previous assignee. */
export async function deleteShift(existing: {
  id: string
  teamId: string
  userId: string
  date: string
  user: { name: string }
}): Promise<void> {
  await withEvents(async (tx, emit) => {
    await tx.shift.delete({ where: { id: existing.id } })
    await emit({
      type: 'SHIFT_DELETED',
      teamId: existing.teamId,
      assigneeUserId: existing.userId,
      assigneeName: existing.user.name,
      date: existing.date,
    })
  })
}
