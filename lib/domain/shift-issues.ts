import { differenceInHours } from 'date-fns'

/**
 * AML §10-8 and industry-guideline evaluation for a single shift, mirroring
 * the algorithm implemented in the Android client (Kotlin
 * `ShiftConflictDetector`). The two implementations must stay in sync — the
 * shared spec is `2026-04-30-aml-rules-extension.md`.
 *
 * The server is the authoritative enforcer: `shift-service.ts` and
 * `swap-service.ts` call `evaluateShiftIssues` and reject writes whose
 * `hardConflict` is non-null. The Android client's local copy of the rules
 * exists purely for fast UI feedback before submit.
 */

/** AML §10-8(1) — at least 11 hours continuous daily rest. */
export const DAILY_REST_HOURS = 11

/** AML §10-8(2) — at least 35 hours continuous rest in any rolling 7-day window. */
export const WEEKLY_REST_HOURS = 35

/** Industry healthcare guideline (not statutory). Streak of 6+ workdays triggers a warning. */
export const MAX_CONSECUTIVE_WORK_DAYS = 5

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Narrowed shift shape required by the evaluator. The full Prisma `Shift`
 * model is a structural superset, so callers can pass a Prisma row directly
 * without mapping.
 */
export interface IssueShift {
  id: string
  /** YYYY-MM-DD — calendar day the shift belongs to. */
  date: string
  startDateTime: Date
  endDateTime: Date
}

/** Narrowed holiday shape. Approved-status filtering is the caller's job. */
export interface IssueHoliday {
  id: string
  /** YYYY-MM-DD. */
  dateFrom: string
  /** YYYY-MM-DD; null means single-day holiday equal to `dateFrom`. */
  dateTo: string | null
}

export type Conflict =
  | { kind: 'Holiday'; request: IssueHoliday }
  | { kind: 'Overlap'; other: IssueShift }
  | { kind: 'RestPeriod'; other: IssueShift; hoursBetween: number }
  | { kind: 'WeeklyRest'; hoursInWindow: number }

export type Warning = { kind: 'ConsecutiveWorkDays'; streakLength: number }

export interface ShiftIssues {
  hardConflict: Conflict | null
  warnings: Warning[]
}

/** Convenience: true when nothing — neither hard conflict nor warning — applies. */
export function isClean(issues: ShiftIssues): boolean {
  return issues.hardConflict === null && issues.warnings.length === 0
}

/**
 * Evaluate `target` against the user's other shifts and approved holidays.
 * Returns the worst hard conflict (Holiday > Overlap > RestPeriod > WeeklyRest)
 * plus any soft warnings. Warnings are advisory and never block.
 */
export function evaluateShiftIssues(
  target: IssueShift,
  userShifts: IssueShift[],
  userHolidays: IssueHoliday[],
): ShiftIssues {
  const holidayMatch = userHolidays.find((h) => holidayCoversDate(h, target.date))
  if (holidayMatch) {
    return { hardConflict: { kind: 'Holiday', request: holidayMatch }, warnings: [] }
  }

  const others = userShifts.filter((s) => s.id !== target.id)
  let hardCandidate: Conflict | null = null

  for (const other of others) {
    const overlaps =
      target.startDateTime < other.endDateTime && target.endDateTime > other.startDateTime
    if (overlaps) {
      hardCandidate = { kind: 'Overlap', other }
      break
    }
    const gapHours = computeGapHours(target, other)
    if (gapHours < DAILY_REST_HOURS) {
      hardCandidate = pickWorseHard(hardCandidate, {
        kind: 'RestPeriod',
        other,
        hoursBetween: gapHours,
      })
    }
  }

  const weeklyHours = longestGapInRollingWeek(target, others)
  if (weeklyHours < WEEKLY_REST_HOURS) {
    hardCandidate = pickWorseHard(hardCandidate, {
      kind: 'WeeklyRest',
      hoursInWindow: weeklyHours,
    })
  }

  const warnings: Warning[] = []
  const streak = countConsecutiveWorkDays(target, others)
  if (streak > MAX_CONSECUTIVE_WORK_DAYS) {
    warnings.push({ kind: 'ConsecutiveWorkDays', streakLength: streak })
  }

  return { hardConflict: hardCandidate, warnings }
}

function holidayCoversDate(h: IssueHoliday, isoDate: string): boolean {
  const to = h.dateTo ?? h.dateFrom
  return isoDate >= h.dateFrom && isoDate <= to
}

function computeGapHours(target: IssueShift, other: IssueShift): number {
  if (target.startDateTime > other.endDateTime) {
    return differenceInHours(target.startDateTime, other.endDateTime)
  }
  if (other.startDateTime > target.endDateTime) {
    return differenceInHours(other.startDateTime, target.endDateTime)
  }
  // Defensive: overlap is handled by the caller before reaching here.
  return Number.POSITIVE_INFINITY
}

function severity(c: Conflict): number {
  switch (c.kind) {
    case 'WeeklyRest':
      return 1
    case 'RestPeriod':
      return 2
    case 'Overlap':
      return 3
    case 'Holiday':
      return 4
  }
}

function pickWorseHard(a: Conflict | null, b: Conflict | null): Conflict | null {
  if (a === null) return b
  if (b === null) return a
  return severity(b) > severity(a) ? b : a
}

function longestGapInRollingWeek(target: IssueShift, others: IssueShift[]): number {
  const windowEnd = target.startDateTime
  const windowStart = new Date(windowEnd.getTime() - SEVEN_DAYS_MS)

  interface Interval {
    start: Date
    end: Date
  }
  const intervals: Interval[] = []
  for (const o of others) {
    const start = o.startDateTime < windowStart ? windowStart : o.startDateTime
    const end = o.endDateTime > windowEnd ? windowEnd : o.endDateTime
    if (start < end) intervals.push({ start, end })
  }
  intervals.sort((a, b) => a.start.getTime() - b.start.getTime())

  if (intervals.length === 0) {
    return differenceInHours(windowEnd, windowStart)
  }

  let longest = differenceInHours(intervals[0].start, windowStart)
  for (let i = 0; i < intervals.length - 1; i++) {
    const gap = differenceInHours(intervals[i + 1].start, intervals[i].end)
    if (gap > longest) longest = gap
  }
  const trailing = differenceInHours(windowEnd, intervals[intervals.length - 1].end)
  if (trailing > longest) longest = trailing

  return longest
}

function countConsecutiveWorkDays(target: IssueShift, others: IssueShift[]): number {
  const workdays = new Set<string>([target.date, ...others.map((o) => o.date)])
  let streak = 1
  let probe = previousIsoDate(target.date)
  while (workdays.has(probe)) {
    streak++
    probe = previousIsoDate(probe)
  }
  return streak
}

/**
 * Subtract one calendar day from a YYYY-MM-DD string in UTC. Avoids relying
 * on local-timezone date arithmetic (DST would otherwise be able to shift
 * the result by an hour and skew month/year rollovers).
 */
function previousIsoDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - 1)
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
