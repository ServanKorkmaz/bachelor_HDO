import { describe, expect, it } from 'vitest'
import {
  DAILY_REST_HOURS,
  IssueHoliday,
  IssueShift,
  MAX_CONSECUTIVE_WORK_DAYS,
  WEEKLY_REST_HOURS,
  evaluateShiftIssues,
  isClean,
} from '@/lib/domain/shift-issues'

/**
 * Test cases mirror Android `ShiftConflictDetectorTest` so divergence between
 * the two implementations is caught by the same scenarios on both sides. When
 * adding a case here, add the parallel case in Kotlin (and vice versa).
 */

let nextId = 0
function makeShift(date: string, start: string, end: string, id?: string): IssueShift {
  return {
    id: id ?? `s${++nextId}`,
    date,
    startDateTime: new Date(start),
    endDateTime: new Date(end),
  }
}

function makeHoliday(from: string, to?: string, id?: string): IssueHoliday {
  return { id: id ?? `h${++nextId}`, dateFrom: from, dateTo: to ?? null }
}

describe('evaluateShiftIssues:constants', () => {
  it('matches AML §10-8 thresholds', () => {
    expect(DAILY_REST_HOURS).toBe(11)
    expect(WEEKLY_REST_HOURS).toBe(35)
    expect(MAX_CONSECUTIVE_WORK_DAYS).toBe(5)
  })
})

describe('evaluateShiftIssues:daily rest and overlap', () => {
  it('returns clean issues when target has no neighbours', () => {
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    const issues = evaluateShiftIssues(target, [], [])
    expect(isClean(issues)).toBe(true)
  })

  it('detects time overlap as Overlap', () => {
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    const other = makeShift('2026-05-10', '2026-05-10T10:00:00Z', '2026-05-10T18:00:00Z', 'other')
    const issues = evaluateShiftIssues(target, [other], [])
    expect(issues.hardConflict).toEqual({ kind: 'Overlap', other })
  })

  it('detects gap < 11h as RestPeriod', () => {
    // other ends 22:00, target starts next-day 06:00 → 8h gap
    const target = makeShift('2026-05-10', '2026-05-10T06:00:00Z', '2026-05-10T14:00:00Z')
    const other = makeShift('2026-05-09', '2026-05-09T14:00:00Z', '2026-05-09T22:00:00Z', 'other')
    const issues = evaluateShiftIssues(target, [other], [])
    expect(issues.hardConflict).toEqual({
      kind: 'RestPeriod',
      other,
      hoursBetween: 8,
    })
  })

  it('allows gap === 11h exactly (no RestPeriod)', () => {
    const target = makeShift('2026-05-10', '2026-05-10T09:00:00Z', '2026-05-10T17:00:00Z')
    const other = makeShift('2026-05-09', '2026-05-09T14:00:00Z', '2026-05-09T22:00:00Z', 'other')
    const issues = evaluateShiftIssues(target, [other], [])
    expect(issues.hardConflict).toBeNull()
  })

  it('ignores the target itself when present in userShifts', () => {
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z', 'target')
    const issues = evaluateShiftIssues(target, [target], [])
    expect(issues.hardConflict).toBeNull()
  })
})

describe('evaluateShiftIssues:holiday', () => {
  it('flags Holiday when an approved holiday covers target.date', () => {
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    const holiday = makeHoliday('2026-05-10')
    const issues = evaluateShiftIssues(target, [], [holiday])
    expect(issues.hardConflict).toEqual({ kind: 'Holiday', request: holiday })
  })

  it('handles a multi-day holiday range inclusively', () => {
    const target = makeShift('2026-05-12', '2026-05-12T08:00:00Z', '2026-05-12T16:00:00Z')
    const holiday = makeHoliday('2026-05-10', '2026-05-14')
    expect(evaluateShiftIssues(target, [], [holiday]).hardConflict).toEqual({
      kind: 'Holiday',
      request: holiday,
    })
  })

  it('ignores holidays that do not cover target.date', () => {
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    const holiday = makeHoliday('2026-05-15', '2026-05-20')
    expect(evaluateShiftIssues(target, [], [holiday]).hardConflict).toBeNull()
  })
})

describe('evaluateShiftIssues:weekly rest (AML §10-8(2))', () => {
  it('clean when there is a single 64h gap (Mon–Fri shifts, target Sun)', () => {
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    const others = [4, 5, 6, 7, 8].map((d) =>
      makeShift(
        `2026-05-0${d}`,
        `2026-05-0${d}T08:00:00Z`,
        `2026-05-0${d}T16:00:00Z`,
      ),
    )
    expect(evaluateShiftIssues(target, others, []).hardConflict).toBeNull()
  })

  it('flags WeeklyRest 30 when longest gap in window is 30h', () => {
    // Window: 2026-05-03 12:00 → 2026-05-10 12:00. Four 6h shifts placed so every
    // gap is ≤ 30h, with trailing 24h. Longest = 30h.
    const target = makeShift('2026-05-10', '2026-05-10T12:00:00Z', '2026-05-10T20:00:00Z')
    const others = [
      makeShift('2026-05-04', '2026-05-04T18:00:00Z', '2026-05-05T00:00:00Z'),
      makeShift('2026-05-06', '2026-05-06T06:00:00Z', '2026-05-06T12:00:00Z'),
      makeShift('2026-05-07', '2026-05-07T18:00:00Z', '2026-05-08T00:00:00Z'),
      makeShift('2026-05-09', '2026-05-09T06:00:00Z', '2026-05-09T12:00:00Z'),
    ]
    expect(evaluateShiftIssues(target, others, []).hardConflict).toEqual({
      kind: 'WeeklyRest',
      hoursInWindow: 30,
    })
  })

  it('clean when there are no other shifts in the 7-day window', () => {
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    expect(evaluateShiftIssues(target, [], []).hardConflict).toBeNull()
  })

  it('measures the leading window-start gap when it is the limiting one', () => {
    // Window: 2026-05-03 08:00 → 2026-05-10 08:00. First shift starts 2026-05-04 14:00
    // (gap from window-start = 30h). Following shifts placed so all subsequent gaps
    // are ≤ 30h. Trailing gap = 6h.
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    const others = [
      makeShift('2026-05-04', '2026-05-04T14:00:00Z', '2026-05-04T20:00:00Z'),
      makeShift('2026-05-06', '2026-05-06T02:00:00Z', '2026-05-06T08:00:00Z'),
      makeShift('2026-05-07', '2026-05-07T14:00:00Z', '2026-05-07T20:00:00Z'),
      makeShift('2026-05-09', '2026-05-09T02:00:00Z', '2026-05-09T08:00:00Z'),
    ]
    expect(evaluateShiftIssues(target, others, []).hardConflict).toEqual({
      kind: 'WeeklyRest',
      hoursInWindow: 30,
    })
  })

  it('ignores shifts entirely outside the 7-day window', () => {
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    const ancient = makeShift('2026-05-01', '2026-05-01T08:00:00Z', '2026-05-01T16:00:00Z')
    expect(evaluateShiftIssues(target, [ancient], []).hardConflict).toBeNull()
  })
})

describe('evaluateShiftIssues:consecutive workdays warning', () => {
  it('emits no warning at 5 consecutive workdays', () => {
    const target = makeShift('2026-05-08', '2026-05-08T08:00:00Z', '2026-05-08T16:00:00Z')
    const others = [4, 5, 6, 7].map((d) =>
      makeShift(
        `2026-05-0${d}`,
        `2026-05-0${d}T08:00:00Z`,
        `2026-05-0${d}T16:00:00Z`,
      ),
    )
    expect(evaluateShiftIssues(target, others, []).warnings).toEqual([])
  })

  it('emits ConsecutiveWorkDays(6) at 6 consecutive workdays', () => {
    const target = makeShift('2026-05-09', '2026-05-09T08:00:00Z', '2026-05-09T16:00:00Z')
    const others = [4, 5, 6, 7, 8].map((d) =>
      makeShift(
        `2026-05-0${d}`,
        `2026-05-0${d}T08:00:00Z`,
        `2026-05-0${d}T16:00:00Z`,
      ),
    )
    const issues = evaluateShiftIssues(target, others, [])
    expect(issues.warnings).toEqual([{ kind: 'ConsecutiveWorkDays', streakLength: 6 }])
  })

  it('does not extend the streak across rest days', () => {
    // Workdays: Mon, Tue, [rest Wed], Thu, Fri, Sat, Sun (target). Streak ending at
    // target = 4. Below the 6-day threshold.
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    const others = [
      makeShift('2026-05-04', '2026-05-04T08:00:00Z', '2026-05-04T16:00:00Z'),
      makeShift('2026-05-05', '2026-05-05T08:00:00Z', '2026-05-05T16:00:00Z'),
      makeShift('2026-05-07', '2026-05-07T08:00:00Z', '2026-05-07T16:00:00Z'),
      makeShift('2026-05-08', '2026-05-08T08:00:00Z', '2026-05-08T16:00:00Z'),
      makeShift('2026-05-09', '2026-05-09T08:00:00Z', '2026-05-09T16:00:00Z'),
    ]
    const issues = evaluateShiftIssues(target, others, [])
    expect(
      issues.warnings.some((w) => w.kind === 'ConsecutiveWorkDays'),
    ).toBe(false)
  })

  it('counts multiple shifts on the same calendar date as one workday', () => {
    const target = makeShift('2026-05-09', '2026-05-09T08:00:00Z', '2026-05-09T16:00:00Z')
    const others = [
      makeShift('2026-05-04', '2026-05-04T08:00:00Z', '2026-05-04T12:00:00Z', 's4a'),
      makeShift('2026-05-04', '2026-05-04T13:00:00Z', '2026-05-04T17:00:00Z', 's4b'),
      makeShift('2026-05-05', '2026-05-05T08:00:00Z', '2026-05-05T16:00:00Z'),
      makeShift('2026-05-06', '2026-05-06T08:00:00Z', '2026-05-06T16:00:00Z'),
      makeShift('2026-05-07', '2026-05-07T08:00:00Z', '2026-05-07T16:00:00Z'),
      makeShift('2026-05-08', '2026-05-08T08:00:00Z', '2026-05-08T16:00:00Z'),
    ]
    const streak = evaluateShiftIssues(target, others, []).warnings[0]
    expect(streak).toEqual({ kind: 'ConsecutiveWorkDays', streakLength: 6 })
  })

  it('does not attribute an earlier streak to a later target', () => {
    // 6-day streak May 4-9, then 4-day gap, then target on May 13. Streak ending
    // at target = 1.
    const target = makeShift('2026-05-13', '2026-05-13T08:00:00Z', '2026-05-13T16:00:00Z')
    const others = [4, 5, 6, 7, 8, 9].map((d) =>
      makeShift(
        `2026-05-0${d}`,
        `2026-05-0${d}T08:00:00Z`,
        `2026-05-0${d}T16:00:00Z`,
      ),
    )
    const issues = evaluateShiftIssues(target, others, [])
    expect(
      issues.warnings.some((w) => w.kind === 'ConsecutiveWorkDays'),
    ).toBe(false)
  })

  it('handles month boundaries in the streak probe', () => {
    // 6-day streak ending at target on May 1: April 26, 27, 28, 29, 30 + May 1.
    const target = makeShift('2026-05-01', '2026-05-01T08:00:00Z', '2026-05-01T16:00:00Z')
    const others = ['2026-04-26', '2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30'].map(
      (d) => makeShift(d, `${d}T08:00:00Z`, `${d}T16:00:00Z`),
    )
    const issues = evaluateShiftIssues(target, others, [])
    expect(issues.warnings).toEqual([{ kind: 'ConsecutiveWorkDays', streakLength: 6 }])
  })
})

describe('evaluateShiftIssues:precedence', () => {
  it('Holiday short-circuits everything else (no other conflicts or warnings)', () => {
    const target = makeShift('2026-05-09', '2026-05-09T08:00:00Z', '2026-05-09T16:00:00Z')
    const overlap = makeShift('2026-05-09', '2026-05-09T10:00:00Z', '2026-05-09T18:00:00Z', 'overlap')
    const streak = [4, 5, 6, 7, 8].map((d) =>
      makeShift(`2026-05-0${d}`, `2026-05-0${d}T08:00:00Z`, `2026-05-0${d}T16:00:00Z`),
    )
    const holiday = makeHoliday('2026-05-09')
    const issues = evaluateShiftIssues(target, [overlap, ...streak], [holiday])
    expect(issues.hardConflict?.kind).toBe('Holiday')
    expect(issues.warnings).toEqual([])
  })

  it('Overlap wins over RestPeriod', () => {
    const target = makeShift('2026-05-10', '2026-05-10T08:00:00Z', '2026-05-10T16:00:00Z')
    const overlap = makeShift('2026-05-10', '2026-05-10T10:00:00Z', '2026-05-10T18:00:00Z', 'overlap')
    const restViolation = makeShift(
      '2026-05-09',
      '2026-05-09T14:00:00Z',
      '2026-05-09T22:00:00Z',
      'rest',
    )
    const issues = evaluateShiftIssues(target, [overlap, restViolation], [])
    expect(issues.hardConflict?.kind).toBe('Overlap')
  })

  it('Overlap wins over WeeklyRest', () => {
    const target = makeShift('2026-05-10', '2026-05-10T12:00:00Z', '2026-05-10T20:00:00Z')
    const overlap = makeShift('2026-05-10', '2026-05-10T14:00:00Z', '2026-05-10T22:00:00Z', 'overlap')
    // weekly-rest fillers (same shape as the 30h test)
    const weeklyFillers = [
      makeShift('2026-05-04', '2026-05-04T18:00:00Z', '2026-05-05T00:00:00Z'),
      makeShift('2026-05-06', '2026-05-06T06:00:00Z', '2026-05-06T12:00:00Z'),
      makeShift('2026-05-07', '2026-05-07T18:00:00Z', '2026-05-08T00:00:00Z'),
      makeShift('2026-05-09', '2026-05-09T06:00:00Z', '2026-05-09T12:00:00Z'),
    ]
    const issues = evaluateShiftIssues(target, [overlap, ...weeklyFillers], [])
    expect(issues.hardConflict?.kind).toBe('Overlap')
  })

  it('RestPeriod wins over WeeklyRest when both apply', () => {
    // Target on May 10 12:00. Immediate previous shift ends May 10 06:00 → 6h gap (RestPeriod).
    // Weekly-rest fillers separately push the longest-gap-in-window below 35h.
    const target = makeShift('2026-05-10', '2026-05-10T12:00:00Z', '2026-05-10T20:00:00Z')
    const restViolation = makeShift(
      '2026-05-10',
      '2026-05-10T00:00:00Z',
      '2026-05-10T06:00:00Z',
      'rest',
    )
    const weeklyFillers = [
      makeShift('2026-05-04', '2026-05-04T18:00:00Z', '2026-05-05T00:00:00Z'),
      makeShift('2026-05-06', '2026-05-06T06:00:00Z', '2026-05-06T12:00:00Z'),
      makeShift('2026-05-07', '2026-05-07T18:00:00Z', '2026-05-08T00:00:00Z'),
    ]
    const issues = evaluateShiftIssues(target, [restViolation, ...weeklyFillers], [])
    expect(issues.hardConflict?.kind).toBe('RestPeriod')
  })
})
