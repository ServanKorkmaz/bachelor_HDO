"use client"

import { useState, useEffect, useMemo } from 'react'
import { format, addWeeks, subWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WeekGrid } from '@/components/WeekGrid'
import { useAuth } from '@/lib/auth/mockAuth'
import { getWeekStart, getWeekDates as getWeekDatesUtil, formatDateDisplay, formatDayName } from '@/lib/date-utils'

export default function StandardPlanPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [shifts, setShifts] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const { currentUser } = useAuth()

  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate])
  const weekDates = useMemo(() => getWeekDatesUtil(selectedDate), [selectedDate])

  useEffect(() => {
    // Fetch teams
    fetch('/api/teams')
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch teams')
        }
        return res.json()
      })
      .then(data => {
        if (Array.isArray(data)) {
          setTeams(data)
          if (data.length > 0 && !selectedTeamId) {
            setSelectedTeamId(data[0].id)
          }
        } else {
          setTeams([])
        }
      })
      .catch(error => {
        console.error('Error fetching teams:', error)
        setTeams([])
      })

    // Fetch users
    fetch('/api/users')
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch users')
        }
        return res.json()
      })
      .then(data => {
        setUsers(Array.isArray(data) ? data : [])
      })
      .catch(error => {
        console.error('Error fetching users:', error)
        setUsers([])
      })
  }, [])

  useEffect(() => {
    if (!selectedTeamId) return

    const startDate = format(weekStart, 'yyyy-MM-dd')
    const endDate = format(weekDates[6], 'yyyy-MM-dd')

    fetch(`/api/shifts?teamId=${selectedTeamId}&dateFrom=${startDate}&dateTo=${endDate}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch shifts')
        }
        return res.json()
      })
      .then(data => {
        setShifts(Array.isArray(data) ? data : [])
      })
      .catch(error => {
        console.error('Error fetching shifts:', error)
        setShifts([])
      })
  }, [selectedTeamId, weekStart, weekDates])

  const handlePrevWeek = () => {
    setSelectedDate(subWeeks(selectedDate, 1))
  }

  const handleNextWeek = () => {
    setSelectedDate(addWeeks(selectedDate, 1))
  }

  const handleToday = () => {
    setSelectedDate(new Date())
  }

  const filteredUsers = useMemo(() => {
    if (!selectedUserId) return users
    return users.filter(u => u.id === selectedUserId)
  }, [users, selectedUserId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Standard plan</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePrevWeek} size="icon">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleToday}>
            I dag
          </Button>
          <Button variant="outline" onClick={handleNextWeek} size="icon">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4 bg-card rounded-lg border">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Dato:</label>
          <input
            type="date"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
            className="px-3 py-1 rounded-md border bg-background text-foreground"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Se oversikt for ansatt:</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-3 py-1 rounded-md border bg-background text-foreground"
          >
            <option value="">Alle</option>
            {Array.isArray(users) && users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Plan:</label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="px-3 py-1 rounded-md border bg-background text-foreground"
          >
            {Array.isArray(teams) && teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      <WeekGrid
        weekDates={weekDates}
        users={filteredUsers}
        shifts={shifts}
        currentUser={currentUser}
      />
    </div>
  )
}

