"use client"

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { formatDateDisplay, formatTime } from '@/lib/date-utils'
import { getShiftChipStyle } from '@/lib/shift-colors'
import { ShiftModal } from '@/components/schedule/ShiftModal'
import { ExportMenu } from '@/components/schedule/ExportMenu'
import { axiosInstance } from '@/lib/axios'

function holidayLabel(type: string): string {
  if (type === 'HOLIDAY') return 'Ferie'
  if (type === 'ABSENCE') return 'Fravær'
  if (type === 'SICKNESS') return 'Sykdom'
  return 'Permisjon'
}

/** Monthly calendar view of shifts with per-day summaries. */
export default function MonthPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedShift, setSelectedShift] = useState<any>(null)
  const [selectedDayShifts, setSelectedDayShifts] = useState<{ date: string; shifts: any[] } | null>(null)
  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('failed to load user')
      return res.json() as Promise<{ id: string; name: string; email: string; role: 'ADMIN' | 'LEADER' | 'EMPLOYEE'; teamId: string }>
    },
  })

  const monthStart = useMemo(() => startOfMonth(selectedDate), [selectedDate])
  const monthEnd = useMemo(() => endOfMonth(selectedDate), [selectedDate])
  const daysInMonth = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart, monthEnd]
  )

  // Get first day of week for the month start
  const firstDayOfWeek = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1 // Monday = 0
  const calendarDays = useMemo(() => {
    const days: (Date | null)[] = []
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null)
    }
    // Add all days in month
    daysInMonth.forEach(day => days.push(day))
    return days
  }, [firstDayOfWeek, daysInMonth])

  const { data: fetchedTeams = [] } = useQuery<any[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/teams')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  useEffect(() => {
    if (Array.isArray(fetchedTeams) && fetchedTeams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(fetchedTeams[0].id)
    }
  }, [fetchedTeams, selectedTeamId])

  const startDate = format(monthStart, 'yyyy-MM-dd')
  const endDate = format(monthEnd, 'yyyy-MM-dd')
  const { data: fetchedShifts = [] } = useQuery<any[]>({
    queryKey: ['shifts', selectedTeamId, startDate, endDate],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/shifts?teamId=${selectedTeamId}&dateFrom=${startDate}&dateTo=${endDate}`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(selectedTeamId),
  })

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, any[]>()
    const activeShifts = Array.isArray(fetchedShifts) ? fetchedShifts : []
    activeShifts.forEach(shift => {
      const dateStr = shift.date
      if (!map.has(dateStr)) {
        map.set(dateStr, [])
      }
      map.get(dateStr)!.push(shift)
    })
    return map
  }, [fetchedShifts])

  const { data: allHolidayRequests = [] } = useQuery<any[]>({
    queryKey: ['holiday-requests', selectedTeamId],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/holiday-requests?teamId=${selectedTeamId}`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(selectedTeamId),
  })

  const approvedHolidayByUser = useMemo(() => {
    const map = new Map<string, any[]>()
    allHolidayRequests
      .filter((r: any) => r.status === 'APPROVED')
      .forEach((r: any) => {
        if (!map.has(r.userId)) map.set(r.userId, [])
        map.get(r.userId)!.push(r)
      })
    return map
  }, [allHolidayRequests])

  const handlePrevMonth = () => {
    setSelectedDate(subMonths(selectedDate, 1))
  }

  const handleNextMonth = () => {
    setSelectedDate(addMonths(selectedDate, 1))
  }

  const handleToday = () => {
    setSelectedDate(new Date())
  }

  const handleDayClick = (date: Date | null) => {
    if (!date) return
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayShifts = shiftsByDate.get(dateStr) || []
    if (dayShifts.length === 1) {
      setSelectedShift(dayShifts[0])
      setSelectedDayShifts(null)
    } else if (dayShifts.length > 1) {
      setSelectedDayShifts({ date: dateStr, shifts: dayShifts })
    } else {
      setSelectedShift(null)
      setSelectedDayShifts(null)
    }
  }

  const handleShiftClick = (shift: any) => {
    setSelectedDayShifts(null)
    setSelectedShift(shift)
  }

  const weekDays = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Måned</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePrevMonth} size="icon" aria-label="Forrige måned">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="outline" onClick={handleToday}>
            I dag
          </Button>
          <Button variant="outline" onClick={handleNextMonth} size="icon" aria-label="Neste måned">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          {selectedTeamId && (
            <ExportMenu
              shifts={fetchedShifts}
              teamName={fetchedTeams.find((t) => t.id === selectedTeamId)?.name ?? 'plan'}
              dateFrom={startDate}
              dateTo={endDate}
              disabled={fetchedShifts.length === 0}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 p-4 bg-card rounded-lg border">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" id="month-team-label">Plan:</label>
          <Select
            value={selectedTeamId}
            onValueChange={setSelectedTeamId}
          >
            <SelectTrigger className="w-[200px]" aria-labelledby="month-team-label">
              <SelectValue placeholder="Velg plan" />
            </SelectTrigger>
            <SelectContent>
              {fetchedTeams.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-lg font-semibold">
          {format(selectedDate, 'MMMM yyyy', { locale: nb })}
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="grid grid-cols-7 gap-px bg-border">
          {weekDays.map(day => (
            <div key={day} className="bg-muted p-2 text-center text-sm font-semibold">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border">
          {calendarDays.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="bg-background min-h-[170px]" />
            }

            const dateStr = format(date, 'yyyy-MM-dd')
            const dayShifts = shiftsByDate.get(dateStr) || []
            const isCurrentMonth = isSameMonth(date, selectedDate)
            const isToday = isSameDay(date, new Date())

            return (
              <div
                key={dateStr}
                className={`bg-background min-h-[170px] p-2.5 border-r border-b border-border cursor-pointer hover:bg-accent transition-colors ${
                  isToday ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => handleDayClick(date)}
              >
                {/* Apply the prev/next-month fade only to the day number, not
                    the whole cell — fading the cell killed shift-chip
                    contrast below WCAG AA. */}
                <div className={`text-base font-semibold mb-2 ${isToday ? 'text-primary' : ''} ${!isCurrentMonth ? 'opacity-50' : ''}`}>
                  {format(date, 'd')}
                </div>
                <div className="space-y-1.5">
                  {dayShifts.slice(0, 3).map((shift: any) => {
                    const userHolidays = approvedHolidayByUser.get(shift.userId) ?? []
                    const approvedHoliday = userHolidays.find(
                      (r: any) => shift.date >= r.dateFrom && shift.date <= (r.dateTo ?? r.dateFrom)
                    ) ?? null
                    return (
                    <button
                      key={shift.id}
                      type="button"
                      className="w-full text-left text-base p-2.5 rounded-md hover:brightness-95 transition"
                      style={getShiftChipStyle(shift.shiftType.color)}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleShiftClick(shift)
                      }}
                      aria-label={`${shift.shiftType.label}, ${shift.user?.name || 'Ukjent ansatt'}, ${formatTime(shift.startDateTime)} til ${formatTime(shift.endDateTime)}${approvedHoliday ? ' (avlyst pga. fravær)' : ''}`}
                    >
                      {approvedHoliday && (
                        <span className="mb-1 inline-block rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                          {holidayLabel(approvedHoliday.type)}
                        </span>
                      )}
                      <div className={`font-semibold leading-tight ${approvedHoliday ? 'line-through opacity-70' : ''}`}>
                        {shift.shiftType.label}
                      </div>
                      <div className={`mt-1.5 text-base font-semibold leading-tight ${approvedHoliday ? 'opacity-70' : ''}`}>
                        {shift.user?.name || 'Ukjent ansatt'}
                      </div>
                      {/* Opacity floors at 70% so faded-cancelled text still
                          meets WCAG AA 4.5:1 on the shift's coloured bg. */}
                      <div className={`mt-1 text-sm leading-tight ${approvedHoliday ? 'line-through opacity-70' : ''}`}>
                        {formatTime(shift.startDateTime)} - {formatTime(shift.endDateTime)}
                      </div>
                      {shift.comment && !approvedHoliday && (
                        <div className="mt-2 text-xs leading-snug whitespace-pre-wrap break-words opacity-70 italic">
                          {shift.comment}
                        </div>
                      )}
                    </button>
                    )
                  })}
                  {dayShifts.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayShifts.length - 3} flere
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selectedShift && (
        <ShiftModal
          shift={selectedShift}
          date={null}
          userId={null}
          onClose={() => setSelectedShift(null)}
          currentUser={me ?? null}
        />
      )}

      {selectedDayShifts && (
        <Dialog open={true} onOpenChange={() => setSelectedDayShifts(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {formatDateDisplay(selectedDayShifts.date)}
              </DialogTitle>
              <DialogDescription>
                {selectedDayShifts.shifts.length} vakter denne dagen
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {selectedDayShifts.shifts.map((shift) => {
                const userHolidays = approvedHolidayByUser.get(shift.userId) ?? []
                const approvedHoliday = userHolidays.find(
                  (r: any) => shift.date >= r.dateFrom && shift.date <= (r.dateTo ?? r.dateFrom)
                ) ?? null
                return (
                <button
                  key={shift.id}
                  type="button"
                  onClick={() => handleShiftClick(shift)}
                  className="w-full rounded-lg border p-4 text-left transition hover:bg-accent"
                >
                  {approvedHoliday && (
                    <span className="mb-2 inline-block rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                      {holidayLabel(approvedHoliday.type)}
                    </span>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className={`text-base font-semibold ${approvedHoliday ? 'line-through opacity-70' : ''}`}>
                        {shift.shiftType?.label || 'Vakt'}
                      </div>
                      <div className={`text-sm text-muted-foreground ${approvedHoliday ? 'opacity-40' : ''}`}>
                        {shift.user?.name || 'Ukjent ansatt'}
                      </div>
                    </div>
                    <div className={`text-sm font-medium text-muted-foreground ${approvedHoliday ? 'line-through opacity-40' : ''}`}>
                      {formatTime(shift.startDateTime)} - {formatTime(shift.endDateTime)}
                    </div>
                  </div>
                  {shift.comment && !approvedHoliday && (
                    <div className="mt-3 text-sm leading-snug text-muted-foreground whitespace-pre-wrap break-words">
                      {shift.comment}
                    </div>
                  )}
                </button>
                )
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

