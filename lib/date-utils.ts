import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parse, isSameDay, addDays, differenceInHours, differenceInMinutes } from 'date-fns'
import { nb } from 'date-fns/locale/nb'

/** Date-only format used across the app (YYYY-MM-DD). */
export const DATE_FORMAT = 'yyyy-MM-dd'
/** Date-time format used for persisted shift timestamps. */
export const DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm"

/** Normalize a date value to the app's DATE_FORMAT. */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parse(date, DATE_FORMAT, new Date()) : date
  return format(d, DATE_FORMAT)
}

/** Format a date value to the app's DATETIME_FORMAT. */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, DATETIME_FORMAT)
}

/** Format a date value as a clock time (HH:mm). */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'HH:mm')
}

/** Format a date for human-readable display in Norwegian. */
export function formatDateDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? parse(date, DATE_FORMAT, new Date()) : date
  return format(d, 'dd.MM.yyyy', { locale: nb })
}

/** Get the localized weekday name for a date. */
export function formatDayName(date: Date | string): string {
  const d = typeof date === 'string' ? parse(date, DATE_FORMAT, new Date()) : date
  return format(d, 'EEEE', { locale: nb })
}

/** Get the start of the week (Monday) for the provided date. */
export function getWeekStart(date: Date = new Date()): Date {
  return startOfWeek(date, { weekStartsOn: 1 }) // Monday
}

/** Get the end of the week (Sunday) for the provided date. */
export function getWeekEnd(date: Date = new Date()): Date {
  return endOfWeek(date, { weekStartsOn: 1 }) // Monday
}

/** Build a 7-day list for the week containing the provided date. */
export function getWeekDates(date: Date = new Date()): Date[] {
  const start = getWeekStart(date)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Shift a date forward by a number of weeks. */
export function addWeek(date: Date, weeks: number = 1): Date {
  return addWeeks(date, weeks)
}

/** Shift a date backward by a number of weeks. */
export function subWeek(date: Date, weeks: number = 1): Date {
  return subWeeks(date, weeks)
}

/** Calculate shift length in hours from start and end timestamps. */
export function calculateShiftHours(startDateTime: Date | string, endDateTime: Date | string): number {
  const start = typeof startDateTime === 'string' ? new Date(startDateTime) : startDateTime
  const end = typeof endDateTime === 'string' ? new Date(endDateTime) : endDateTime
  
  const minutes = differenceInMinutes(end, start)
  return minutes / 60
}

/** Format decimal hours as H:mm for display. */
export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

