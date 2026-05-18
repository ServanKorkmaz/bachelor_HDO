import { parse } from 'date-fns'

/** Thrown when shift start/end times are inconsistent or unreasonable. */
export class ShiftTimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShiftTimeError'
  }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Build the concrete startDateTime/endDateTime pair for a shift given a
 * calendar date, wall-clock times, and the parent ShiftType.
 *
 * Rules:
 *  - Start and end times must differ. Equal times are rejected outright,
 *    since "08:00 to 08:00" silently produced a 24-hour shift in the
 *    previous inline heuristic.
 *  - If `shiftType.crossesMidnight` is true, end is always rolled forward
 *    one day.
 *  - If end falls strictly before start, treat it as an overnight override
 *    even when the ShiftType is not marked as overnight (e.g. someone
 *    enters 22:00 → 06:00 on a "Day" type) and roll end forward one day.
 *  - The resulting duration must be strictly greater than zero and at most
 *    24 hours.
 */
export function buildShiftDateTimes(args: {
  date: string
  startTime: string
  endTime: string
  shiftType: { crossesMidnight: boolean }
}): { startDateTime: Date; endDateTime: Date } {
  const { date, startTime, endTime, shiftType } = args

  const startDateTime = parse(`${date}T${startTime}`, "yyyy-MM-dd'T'HH:mm", new Date())
  let endDateTime = parse(`${date}T${endTime}`, "yyyy-MM-dd'T'HH:mm", new Date())

  if (startTime === endTime) {
    if (startTime !== '00:00') {
      throw new ShiftTimeError('Start- og sluttid kan ikke være like')
    }
    // 00:00 → 00:00 is a full-day placeholder used for off/free shift types
    return { startDateTime, endDateTime: new Date(startDateTime.getTime() + ONE_DAY_MS) }
  }

  if (shiftType.crossesMidnight || endDateTime < startDateTime) {
    endDateTime = new Date(endDateTime.getTime() + ONE_DAY_MS)
  }

  const durationMs = endDateTime.getTime() - startDateTime.getTime()
  if (durationMs <= 0 || durationMs > ONE_DAY_MS) {
    throw new ShiftTimeError('Vaktlengde må være mellom 0 og 24 timer')
  }

  return { startDateTime, endDateTime }
}
