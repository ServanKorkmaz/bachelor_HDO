"use client"

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import { formatHours, calculateShiftHours } from '@/lib/date-utils'
import { ShiftModal } from './ShiftModal'
import { MockUser } from '@/lib/auth/mockAuth'

interface ShiftType {
  id: string
  code: string
  label: string
  color: string
  defaultStartTime: string
  defaultEndTime: string
  crossesMidnight: boolean
}

interface Shift {
  id: string
  userId: string
  date: string
  startDateTime: string
  endDateTime: string
  shiftType: ShiftType
  user: {
    id: string
    name: string
  }
  comment?: string
}

interface WeekGridProps {
  weekDates: Date[]
  users: any[]
  shifts: Shift[]
  currentUser: MockUser | null
}

export function WeekGrid({ weekDates, users, shifts, currentUser }: WeekGridProps) {
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
      // No shift - allow creating one or adding note
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
                <th key={date.toISOString()} className="border border-border p-2 text-center bg-muted min-w-[120px]">
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
                <td className="border border-border p-2 bg-muted sticky left-0 z-10 font-medium">
                  {user.name}
                </td>
                {weekDates.map((date) => {
                  const dateStr = format(date, 'yyyy-MM-dd')
                  const key = `${user.id}-${dateStr}`
                  const shift = shiftsByUserAndDate.get(key)
                  
                  return (
                    <td
                      key={date.toISOString()}
                      className="border border-border p-2 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleCellClick(user.id, date)}
                    >
                      {shift ? (
                        <div
                          className="rounded p-1 text-xs"
                          style={{ backgroundColor: shift.shiftType.color + '40', color: '#fff' }}
                        >
                          <div className="font-medium">{shift.shiftType.label}</div>
                          <div className="text-xs opacity-90">
                            {format(new Date(shift.startDateTime), 'HH:mm')} - {format(new Date(shift.endDateTime), 'HH:mm')}
                          </div>
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

