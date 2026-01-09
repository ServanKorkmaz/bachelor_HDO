"use client"

import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth/mockAuth'
import { formatDateDisplay } from '@/lib/date-utils'
import { ShiftModal } from '@/components/ShiftModal'

export default function MonthPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [shifts, setShifts] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedShift, setSelectedShift] = useState<any>(null)
  const { currentUser } = useAuth()

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

  useEffect(() => {
    fetch('/api/teams')
      .then(res => res.json())
      .then(data => {
        setTeams(data)
        if (data.length > 0 && !selectedTeamId) {
          setSelectedTeamId(data[0].id)
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedTeamId) return

    const startDate = format(monthStart, 'yyyy-MM-dd')
    const endDate = format(monthEnd, 'yyyy-MM-dd')

    fetch(`/api/shifts?teamId=${selectedTeamId}&dateFrom=${startDate}&dateTo=${endDate}`)
      .then(res => res.json())
      .then(data => setShifts(data))
      .catch(console.error)
  }, [selectedTeamId, monthStart, monthEnd])

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, any[]>()
    shifts.forEach(shift => {
      const dateStr = shift.date
      if (!map.has(dateStr)) {
        map.set(dateStr, [])
      }
      map.get(dateStr)!.push(shift)
    })
    return map
  }, [shifts])

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
    if (dayShifts.length > 0) {
      setSelectedShift(dayShifts[0])
    } else {
      setSelectedShift(null)
    }
  }

  const weekDays = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Måned</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePrevMonth} size="icon">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleToday}>
            I dag
          </Button>
          <Button variant="outline" onClick={handleNextMonth} size="icon">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 p-4 bg-card rounded-lg border">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Plan:</label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="px-3 py-1 rounded-md border bg-background text-foreground"
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
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
              return <div key={`empty-${index}`} className="bg-background min-h-[100px]" />
            }

            const dateStr = format(date, 'yyyy-MM-dd')
            const dayShifts = shiftsByDate.get(dateStr) || []
            const isCurrentMonth = isSameMonth(date, selectedDate)
            const isToday = isSameDay(date, new Date())

            return (
              <div
                key={dateStr}
                className={`bg-background min-h-[100px] p-2 border-r border-b border-border cursor-pointer hover:bg-accent transition-colors ${
                  !isCurrentMonth ? 'opacity-30' : ''
                } ${isToday ? 'ring-2 ring-primary' : ''}`}
                onClick={() => handleDayClick(date)}
              >
                <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>
                  {format(date, 'd')}
                </div>
                <div className="space-y-1">
                  {dayShifts.slice(0, 3).map((shift: any) => (
                    <div
                      key={shift.id}
                      className="text-xs p-1 rounded"
                      style={{
                        backgroundColor: shift.shiftType.color + '40',
                        color: '#fff',
                      }}
                    >
                      {shift.shiftType.label}
                    </div>
                  ))}
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
          currentUser={currentUser}
        />
      )}
    </div>
  )
}

