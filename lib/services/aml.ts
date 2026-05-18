import { Prisma } from '@prisma/client'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { evaluateShiftIssues, type Conflict } from '@/lib/domain/shift-issues'
import { ServiceError } from './errors'

/**
 * Look up the user's nearby shifts and active approved holidays, then run the
 * AML §10-8 evaluator. Throws a typed ServiceError when a hard conflict is
 * detected. Must be called inside a transaction so the validation is
 * serialised with the write. No TOCTOU window where two parallel callers
 * each see "clean" and both insert a violating shift.
 *
 * `targetId` is the id of the row being created or updated (use a stable
 * placeholder for create flows). `excludeShiftIds` lets swap flows drop rows
 * that are about to leave the user. E.g. the shift they're giving away in a
 * two-way swap should not count against their post-swap schedule.
 *
 * The 14-day shift-fetch window is intentionally wider than the 7-day rolling
 * window the evaluator needs; it covers streak-probe lookback and absorbs
 * day-boundary edge cases without per-call windowing logic.
 */
export async function assertNoAmlConflict(
  tx: Prisma.TransactionClient,
  args: {
    targetId: string
    userId: string
    date: string
    startDateTime: Date
    endDateTime: Date
    excludeShiftIds?: string[]
  }
): Promise<void> {
  const parsed = parseISO(args.date)
  const windowFrom = format(subDays(parsed, 14), 'yyyy-MM-dd')
  const windowTo = format(addDays(parsed, 1), 'yyyy-MM-dd')

  const excluded = Array.from(new Set([args.targetId, ...(args.excludeShiftIds ?? [])]))

  const [otherShifts, holidays] = await Promise.all([
    tx.shift.findMany({
      where: {
        userId: args.userId,
        date: { gte: windowFrom, lte: windowTo },
        id: { notIn: excluded },
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

/** Map a hard conflict to a Norwegian-message ServiceError with 422 status. */
export function amlError(c: Conflict): ServiceError {
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
