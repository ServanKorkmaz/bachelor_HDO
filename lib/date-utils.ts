import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parse, isSameDay, addDays, differenceInHours, differenceInMinutes } from 'date-fns'
import { nb } from 'date-fns/locale/nb'

export const DATE_FORMAT = 'yyyy-MM-dd'
export const DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm"

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parse(date, DATE_FORMAT, new Date()) : date
  return format(d, DATE_FORMAT)
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, DATETIME_FORMAT)
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'HH:mm')
}

export function formatDateDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? parse(date, DATE_FORMAT, new Date()) : date
  return format(d, 'dd.MM.yyyy', { locale: nb })
}

export function formatDayName(date: Date | string): string {
  const d = typeof date === 'string' ? parse(date, DATE_FORMAT, new Date()) : date
  return format(d, 'EEEE', { locale: nb })
}

export function getWeekStart(date: Date = new Date()): Date {
  return startOfWeek(date, { weekStartsOn: 1 }) // Monday
}

export function getWeekEnd(date: Date = new Date()): Date {
  return endOfWeek(date, { weekStartsOn: 1 }) // Monday
}

export function getWeekDates(date: Date = new Date()): Date[] {
  const start = getWeekStart(date)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function addWeek(date: Date, weeks: number = 1): Date {
  return addWeeks(date, weeks)
}

export function subWeek(date: Date, weeks: number = 1): Date {
  return subWeeks(date, weeks)
}

export function calculateShiftHours(startDateTime: Date | string, endDateTime: Date | string): number {
  const start = typeof startDateTime === 'string' ? new Date(startDateTime) : startDateTime
  const end = typeof endDateTime === 'string' ? new Date(endDateTime) : endDateTime
  
  const minutes = differenceInMinutes(end, start)
  return minutes / 60
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

