"use client"

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import { formatHours, calculateShiftHours } from '@/lib/date-utils'
import { getShiftChipStyle } from '@/lib/shift-colors'
import { ShiftModal } from './ShiftModal'
import type { Shift, Me } from './ShiftModal'
import type { UserSummary } from '@/lib/types'
import {
  evaluateShiftIssues,
  isClean,
  type IssueHoliday,
  type IssueShift,
  type ShiftIssues,
} from '@/lib/domain/shift-issues'
import { ShiftIssueDot } from './ShiftIssueIndicator'

export interface HolidayRequest {
  id: string
  userId: string
  type: string
  status: string
  dateFrom: string
  dateTo: string | null
}

interface WeekGridProps {
  weekDates: Date[]
  users: UserSummary[]
  shifts: Shift[]
  currentUser: Me | null
  highlightedUserId?: string
  onSelectUser?: (userId: string) => void
  holidayRequests?: HolidayRequest[]
}

function holidayLabel(type: string): string {
  if (type === 'HOLIDAY') return 'Ferie'
  if (type === 'ABSENCE') return 'Fravær'
  if (type === 'SICKNESS') return 'Sykdom'
  return 'Permisjon'
}

/** Render the weekly schedule grid with per-user totals and shift editing. */
export function WeekGrid({ weekDates, users, shifts, currentUser, highlightedUserId, onSelectUser, holidayRequests = [] }: WeekGridProps) {
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const shiftsByUserAndDate = useMemo(() => {
    const map = new Map<string, Shift>()
    shifts.forEach(shift => {
      const key = `${shift.userId}-${shift.date}`
      map.set(key, shift)
    })
    return map
  }, [shifts])

  const holidayByUser = useMemo(() => {
    const map = new Map<string, HolidayRequest[]>()
    holidayRequests.forEach(r => {
      if (!map.has(r.userId)) map.set(r.userId, [])
      map.get(r.userId)!.push(r)
    })
    return map
  }, [holidayRequests])

  /**
   * AML §10-8 issues per visible shift, computed from the same `shifts` and
   * `holidayRequests` props the grid already has. Limitation: the rolling
   * 7-day weekly-rest window only looks at shifts loaded by the parent — a
   * gap that straddles the start of the visible window won't be flagged
   * here. The server-side check at save time is still authoritative.
   */
  const issuesByShift = useMemo(() => {
    const shiftsByUser = new Map<string, IssueShift[]>()
    shifts.forEach((s) => {
      if (!shiftsByUser.has(s.userId)) shiftsByUser.set(s.userId, [])
      shiftsByUser.get(s.userId)!.push({
        id: s.id,
        date: s.date,
        startDateTime: new Date(s.startDateTime),
        endDateTime: new Date(s.endDateTime),
      })
    })
    const holidaysByUser = new Map<string, IssueHoliday[]>()
    holidayRequests.forEach((h) => {
      if (h.status !== 'APPROVED') return
      if (!holidaysByUser.has(h.userId)) holidaysByUser.set(h.userId, [])
      holidaysByUser.get(h.userId)!.push({
        id: h.id,
        dateFrom: h.dateFrom,
        dateTo: h.dateTo,
      })
    })
    const map = new Map<string, ShiftIssues>()
    shifts.forEach((s) => {
      const userShifts = shiftsByUser.get(s.userId) ?? []
      const userHolidays = holidaysByUser.get(s.userId) ?? []
      const target: IssueShift = {
        id: s.id,
        date: s.date,
        startDateTime: new Date(s.startDateTime),
        endDateTime: new Date(s.endDateTime),
      }
      const issues = evaluateShiftIssues(target, userShifts, userHolidays)
      if (!isClean(issues)) map.set(s.id, issues)
    })
    return map
  }, [shifts, holidayRequests])

  const weeklyHours = useMemo(() => {
    const hoursByUser = new Map<string, number>()

    users.forEach(user => {
      let totalHours = 0
      weekDates.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const key = `${user.id}-${dateStr}`
        const shift = shiftsByUserAndDate.get(key)
        if (shift) {
          const hours = calculateShiftHours(shift.startDateTime, shift.endDateTime)
          totalHours += hours
        }
      })
      hoursByUser.set(user.id, totalHours)
    })

    return hoursByUser
  }, [users, weekDates, shiftsByUserAndDate])

  const handleCellClick = (userId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const key = `${userId}-${dateStr}`
    const shift = shiftsByUserAndDate.get(key)

    if (shift) {
      setSelectedShift(shift)
      setSelectedDate(null)
      setSelectedUserId(null)
    } else {
      setSelectedShift(null)
      setSelectedDate(dateStr)
      setSelectedUserId(userId)
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-border p-2 text-left bg-muted sticky left-0 z-10">Ansatt</th>
              {weekDates.map((date) => (
                <th key={date.toISOString()} className="border border-border p-1.5 text-center bg-muted min-w-[115px]">
                  <div className="font-semibold">
                    {format(date, 'EEEE', { locale: nb })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(date, 'dd/MM')}
                  </div>
                </th>
              ))}
              <th className="border border-border p-2 text-center bg-muted">Sum</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className={`border border-border p-2 bg-muted sticky left-0 z-10 font-medium ${highlightedUserId === user.id ? 'bg-primary/10' : ''}`}>
                  <button
                    type="button"
                    onClick={() => onSelectUser?.(user.id)}
                    className="w-full text-left hover:text-primary transition-colors"
                  >
                    {user.name}
                  </button>
                </td>
                {weekDates.map((date) => {
                  const dateStr = format(date, 'yyyy-MM-dd')
                  const key = `${user.id}-${dateStr}`
                  const shift = shiftsByUserAndDate.get(key)

                  const userHolidays = holidayByUser.get(user.id) ?? []
                  const approvedHoliday = userHolidays.find(
                    r => dateStr >= r.dateFrom && dateStr <= (r.dateTo ?? r.dateFrom)
                  ) ?? null

                  return (
                    <td
                      key={date.toISOString()}
                      className="border border-border p-1.5 h-24 align-top cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleCellClick(user.id, date)}
                    >
                      {shift ? (
                        <div
                          className="group relative min-h-[72px] rounded-md p-2 text-sm"
                          style={getShiftChipStyle(shift.shiftType.color)}
                        >
                          {issuesByShift.has(shift.id) && (
                            <ShiftIssueDot
                              issues={issuesByShift.get(shift.id)!}
                              className="absolute right-1 top-1"
                            />
                          )}
                          {approvedHoliday && (
                            <span className="mb-1 inline-block rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              {holidayLabel(approvedHoliday.type)}
                            </span>
                          )}
                          <div className={`font-semibold leading-tight ${approvedHoliday ? 'line-through opacity-50' : ''}`}>
                            {shift.shiftType.label}
                          </div>
                          <div className={`mt-1 text-sm opacity-95 ${approvedHoliday ? 'line-through opacity-40' : ''}`}>
                            {format(new Date(shift.startDateTime), 'HH:mm')} - {format(new Date(shift.endDateTime), 'HH:mm')}
                          </div>
                          {shift.comment && !approvedHoliday && (
                            <>
                              <div className="mt-2 rounded-md bg-red-950 border border-red-800 p-2 text-xs leading-snug whitespace-pre-wrap break-words text-red-100">
                                {shift.comment}
                              </div>
                              <div className="pointer-events-none absolute left-full top-0 z-30 ml-2 hidden w-64 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg group-hover:block">
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Kommentar
                                </div>
                                <div className="leading-relaxed whitespace-pre-wrap break-words">
                                  {shift.comment}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ) : approvedHoliday ? (
                        <div className="min-h-[72px] rounded-md border border-amber-400 bg-amber-50 p-2 text-sm dark:bg-amber-950/30 dark:border-amber-700">
                          <span className="inline-block rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            {holidayLabel(approvedHoliday.type)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">-</div>
                      )}
                    </td>
                  )
                })}
                <td className="border border-border p-2 text-center font-medium">
                  {formatHours(weeklyHours.get(user.id) || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(selectedShift || selectedDate) && (
        <ShiftModal
          shift={selectedShift}
          date={selectedDate}
          userId={selectedUserId}
          onClose={() => {
            setSelectedShift(null)
            setSelectedDate(null)
            setSelectedUserId(null)
          }}
          currentUser={currentUser}
        />
      )}
    </>
  )
}
