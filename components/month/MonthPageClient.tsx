"use client"

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  subMonths,
} from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth/mockAuth'
import { ShiftModal } from '@/components/schedule/ShiftModal'
import type { Shift } from '@/components/schedule/ShiftModal'

type Team = {
  id: string
  name: string
}

interface MonthPageClientProps {
  initialDate: string
  initialTeams: Team[]
  initialTeamId: string
  initialShifts: Shift[]
}

const weekDays = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']

/** Client month view using TanStack Query + axios for smooth updates after SSR initial render. */
export default function MonthPageClient({
  initialDate,
  initialTeams,
  initialTeamId,
  initialShifts,
}: MonthPageClientProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date(initialDate))
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId)
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null)
  const { currentUser } = useAuth()

  const monthStart = useMemo(() => startOfMonth(selectedDate), [selectedDate])
  const monthEnd = useMemo(() => endOfMonth(selectedDate), [selectedDate])
  const startDate = useMemo(() => format(monthStart, 'yyyy-MM-dd'), [monthStart])
  const endDate = useMemo(() => format(monthEnd, 'yyyy-MM-dd'), [monthEnd])

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await axios.get<Team[]>('/api/teams')
      return response.data
    },
    initialData: initialTeams,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id)
    }
  }, [selectedTeamId, teams])

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ['month-shifts', selectedTeamId, startDate, endDate],
    queryFn: async () => {
      if (!selectedTeamId) return []
      const response = await axios.get<Shift[]>('/api/shifts', {
        params: {
          teamId: selectedTeamId,
          dateFrom: startDate,
          dateTo: endDate,
        },
      })
      return response.data
    },
    enabled: Boolean(selectedTeamId),
    initialData:
      selectedTeamId === initialTeamId &&
      startDate === format(startOfMonth(new Date(initialDate)), 'yyyy-MM-dd') &&
      endDate === format(endOfMonth(new Date(initialDate)), 'yyyy-MM-dd')
        ? initialShifts
        : undefined,
  })

  const daysInMonth = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart, monthEnd]
  )

  const firstDayOfWeek = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1
  const calendarDays = useMemo(() => {
    const days: Array<Date | null> = []
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null)
    }
    daysInMonth.forEach(day => days.push(day))
    return days
  }, [firstDayOfWeek, daysInMonth])

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift[]>()
    shifts.forEach(shift => {
      const dateKey = shift.date
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(shift)
    })
    return map
  }, [shifts])

  const handleDayClick = (date: Date | null) => {
    if (!date) return
    const dayKey = format(date, 'yyyy-MM-dd')
    const dayShifts = shiftsByDate.get(dayKey) || []
    setSelectedShift(dayShifts.length > 0 ? dayShifts[0] : null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Måned</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setSelectedDate(subMonths(selectedDate, 1))} size="icon">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setSelectedDate(new Date())}>
            I dag
          </Button>
          <Button variant="outline" onClick={() => setSelectedDate(addMonths(selectedDate, 1))} size="icon">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Plan:</label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="rounded-md border bg-background px-3 py-1 text-foreground"
          >
            {teams.map(team => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <div className="text-lg font-semibold">
          {format(selectedDate, 'MMMM yyyy', { locale: nb })}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
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
              return <div key={`empty-${index}`} className="min-h-[100px] bg-background" />
            }

            const dateKey = format(date, 'yyyy-MM-dd')
            const dayShifts = shiftsByDate.get(dateKey) || []
            const isCurrentMonth = isSameMonth(date, selectedDate)
            const isToday = isSameDay(date, new Date())

            return (
              <div
                key={dateKey}
                className={`min-h-[100px] cursor-pointer border-b border-r border-border bg-background p-2 transition-colors hover:bg-accent ${
                  !isCurrentMonth ? 'opacity-30' : ''
                } ${isToday ? 'ring-2 ring-primary' : ''}`}
                onClick={() => handleDayClick(date)}
              >
                <div className={`mb-1 text-sm font-medium ${isToday ? 'text-primary' : ''}`}>
                  {format(date, 'd')}
                </div>
                <div className="space-y-1">
                  {dayShifts.slice(0, 3).map(shift => (
                    <div
                      key={shift.id}
                      className="rounded p-1 text-xs"
                      style={{
                        backgroundColor: `${shift.shiftType.color}40`,
                        color: '#fff',
                      }}
                    >
                      <div className="font-medium">{shift.shiftType.label}</div>
                      {shift.user?.name && (
                        <div className="truncate text-[11px] opacity-90">{shift.user.name}</div>
                      )}
                      {shift.comment && (
                        <div className="mt-0.5 border-t border-white/30 pt-0.5 text-xs opacity-90">
                          {shift.comment}
                        </div>
                      )}
                    </div>
                  ))}
                  {dayShifts.length > 3 && (
                    <div className="text-xs text-muted-foreground">+{dayShifts.length - 3} flere</div>
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
          currentUser={currentUser}
        />
      )}
    </div>
  )
}
