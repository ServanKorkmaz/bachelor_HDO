import { format, startOfWeek, addDays, differenceInMinutes, getISOWeek, getISOWeekYear, parse, setISOWeek, setISOWeekYear } from 'date-fns'
import { nb } from 'date-fns/locale/nb'

/** Date-only format used across the app (YYYY-MM-DD). */
export const DATE_FORMAT = 'yyyy-MM-dd'
/** Date-time format used for persisted shift timestamps. */
export const DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm"

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

/** Application timezone (Norway). */
export const APP_TIMEZONE = 'Europe/Oslo'

/** Format a Date to YYYY-MM-DD in the given IANA time zone. */
export function formatDateInTimeZone(date: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  // Use en-CA locale to get YYYY-MM-DD ordering
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date)
}

/** Return a YYYY-MM-DD string for N days ago in the given time zone. */
export function dateNDaysAgoString(n: number, timeZone: string = APP_TIMEZONE): string {
  const msPerDay = 24 * 60 * 60 * 1000
  const d = new Date(Date.now() - n * msPerDay)
  return formatDateInTimeZone(d, timeZone)
}

/** Return today's date string (YYYY-MM-DD) in the given time zone. */
export function todayStringInTimeZone(timeZone: string = APP_TIMEZONE): string {
  return formatDateInTimeZone(new Date(), timeZone)
}

/** Get the start of the week (Monday) for the provided date. */
export function getWeekStart(date: Date = new Date()): Date {
  return startOfWeek(date, { weekStartsOn: 1 }) // Monday
}

/** Build a 7-day list for the week containing the provided date. */
export function getWeekDates(date: Date = new Date()): Date[] {
  const start = getWeekStart(date)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Calculate shift length in hours from start and end timestamps. */
export function calculateShiftHours(startDateTime: Date | string, endDateTime: Date | string): number {
  const start = typeof startDateTime === 'string' ? new Date(startDateTime) : startDateTime
  const end = typeof endDateTime === 'string' ? new Date(endDateTime) : endDateTime
  
  const minutes = differenceInMinutes(end, start)
  return minutes / 60
}

/** ISO week-year and week-number identifier. Used for keying week notes
 * and rendering "Uke 11 - 2026"-style headers. ISO year may differ from
 * the calendar year at January/December boundaries (e.g. 2024-12-30 is
 * 2025-W01) — always use the ISO year together with the ISO week. */
export interface IsoWeek {
  year: number
  week: number
}

/** Get the ISO week and ISO week-year for a date. */
export function getIsoWeek(date: Date): IsoWeek {
  return { year: getISOWeekYear(date), week: getISOWeek(date) }
}

/** Build a Date pointing at the Monday of a given ISO (year, week). */
export function fromIsoWeek(year: number, week: number): Date {
  // setISOWeekYear must run before setISOWeek because the former resets the
  // week to 1 if the source date's week doesn't exist in the target year.
  const base = setISOWeekYear(new Date(), year)
  const monday = setISOWeek(base, week)
  return getWeekStart(monday)
}

/** Format decimal hours as H:mm for display. */
export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

