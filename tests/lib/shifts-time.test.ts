import { describe, expect, it } from 'vitest'
import { buildShiftDateTimes, ShiftTimeError } from '@/lib/shifts/time'

const dayShift = { crossesMidnight: false }
const nightShift = { crossesMidnight: true }

describe('buildShiftDateTimes', () => {
  it('returns an 8-hour interval for a normal day shift', () => {
    const { startDateTime, endDateTime } = buildShiftDateTimes({
      date: '2026-05-13',
      startTime: '08:00',
      endTime: '16:00',
      shiftType: dayShift,
    })
    const hours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)
    expect(hours).toBe(8)
  })

  it('rolls end forward 24h when crossesMidnight is true', () => {
    const { startDateTime, endDateTime } = buildShiftDateTimes({
      date: '2026-05-13',
      startTime: '22:00',
      endTime: '06:00',
      shiftType: nightShift,
    })
    const hours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)
    expect(hours).toBe(8)
    // end should be on the next day
    expect(endDateTime.getDate()).toBe(startDateTime.getDate() + 1)
  })

  it('treats end<start as an overnight override even on a day-shift type', () => {
    const { startDateTime, endDateTime } = buildShiftDateTimes({
      date: '2026-05-13',
      startTime: '20:00',
      endTime: '04:00',
      shiftType: dayShift,
    })
    const hours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)
    expect(hours).toBe(8)
  })

  it('rejects start === end with a clear error', () => {
    expect(() =>
      buildShiftDateTimes({
        date: '2026-05-13',
        startTime: '08:00',
        endTime: '08:00',
        shiftType: dayShift,
      })
    ).toThrow(ShiftTimeError)
    expect(() =>
      buildShiftDateTimes({
        date: '2026-05-13',
        startTime: '08:00',
        endTime: '08:00',
        shiftType: dayShift,
      })
    ).toThrow(/like/i)
  })

  it('rejects a 24h+ duration via crossesMidnight + same wall-clock times', () => {
    // start=00:00 end=00:00 → equal, rejected before any rollover happens
    expect(() =>
      buildShiftDateTimes({
        date: '2026-05-13',
        startTime: '00:00',
        endTime: '00:00',
        shiftType: nightShift,
      })
    ).toThrow(ShiftTimeError)
  })
})
