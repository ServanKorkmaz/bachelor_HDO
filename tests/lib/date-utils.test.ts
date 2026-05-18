import { describe, expect, it, vi } from 'vitest'
import { format } from 'date-fns'
import {
  calculateShiftHours,
  DATE_FORMAT,
  dateNDaysAgoString,
  formatDateDisplay,
  formatDayName,
  formatHours,
  formatTime,
  getWeekDates,
  getWeekStart,
  todayStringInTimeZone,
} from '@/lib/date-utils'

/** Unit tests for date utility helpers. */
describe('date-utils', () => {
  it('formatTime returns time as HH:mm', () => {
    expect(formatTime(new Date('2026-04-27T08:30:00.000Z'))).toMatch(/^\d{2}:\d{2}$/)
  })

  it('formatDateDisplay returns date in DD.MM.YYYY format', () => {
    expect(formatDateDisplay('2026-04-27')).toBe('27.04.2026')
  })

  it('formatDayName returns Norwegian weekday name', () => {
    // 2026-04-27 is a Monday (mandag in Norwegian).
    const day = formatDayName('2026-04-27')
    expect(day).toBe('mandag')
  })

  it('getWeekStart/getWeekDates uses Monday as week start', () => {
    const ref = new Date('2026-04-29T10:00:00.000Z') // Wednesday
    const weekStart = getWeekStart(ref)
    const weekDates = getWeekDates(ref)
    expect(weekStart.getDay()).toBe(1) // Monday in local timezone
    expect(weekDates).toHaveLength(7)
    expect(weekDates[0].toISOString().slice(0, 10)).toBe(weekStart.toISOString().slice(0, 10))
    expect(weekDates[6].getDay()).toBe(0) // Sunday
  })

  it('calculateShiftHours calculates hours correctly for partial hours', () => {
    expect(calculateShiftHours('2026-04-27T08:00:00.000Z', '2026-04-27T15:30:00.000Z')).toBe(7.5)
  })

  it('formatHours rounds correctly when minutes reach 60', () => {
    expect(formatHours(7.999)).toBe('8:00')
    expect(formatHours(7.5)).toBe('7:30')
  })

  it('dateNDaysAgoString/todayStringInTimeZone returns YYYY-MM-DD format', () => {
    // Use fake timers to make timezone-sensitive assertions deterministic.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T10:00:00.000Z'))

    expect(todayStringInTimeZone('Europe/Oslo')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(dateNDaysAgoString(3, 'Europe/Oslo')).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    vi.useRealTimers()
  })

  describe('ISO week helpers', () => {
    it('getIsoWeek returns ISO year/week for a mid-year date', async () => {
      const { getIsoWeek } = await import('@/lib/date-utils')
      const result = getIsoWeek(new Date('2026-03-10T00:00:00.000Z'))
      expect(result).toEqual({ year: 2026, week: 11 })
    })

    it('getIsoWeek handles the Jan/Dec ISO year-boundary correctly', async () => {
      const { getIsoWeek } = await import('@/lib/date-utils')
      // 2024-12-30 is a Monday and belongs to ISO 2025-W01, not 2024.
      const result = getIsoWeek(new Date('2024-12-30T00:00:00.000Z'))
      expect(result).toEqual({ year: 2025, week: 1 })
    })

    it('fromIsoWeek returns the Monday of the requested ISO week', async () => {
      const { fromIsoWeek } = await import('@/lib/date-utils')
      const monday = fromIsoWeek(2026, 11)
      // ISO week 11 of 2026 starts Monday 2026-03-09.
      expect(format(monday, DATE_FORMAT)).toBe('2026-03-09')
    })

    it('getIsoWeek + fromIsoWeek round-trip', async () => {
      const { getIsoWeek, fromIsoWeek } = await import('@/lib/date-utils')
      const original = new Date('2026-07-15T00:00:00.000Z')
      const iso = getIsoWeek(original)
      const back = fromIsoWeek(iso.year, iso.week)
      // We expect the Monday of the week that contained the original date.
      expect(format(back, DATE_FORMAT)).toBe('2026-07-13')
    })
  })
})
