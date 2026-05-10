"use client"

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { addDays, differenceInCalendarDays, format, parseISO, addWeeks, subWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WeekGrid } from '@/components/schedule/WeekGrid'
import { BulkShiftModal } from '@/components/BulkShiftModal'
import { useAuth } from '@/lib/auth/mockAuth'
import { getWeekStart, getWeekDates as getWeekDatesUtil } from '@/lib/date-utils'
import { getShiftChipStyle } from '@/lib/shift-colors'
import { axiosInstance } from '@/lib/axios'

const TEAM_ID_PARAM = 'teamId'

/** Standard weekly schedule view with team and user filters. Valgt team persisteres i URL så det overlever refresh. */
export default function StandardPlanPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const { currentUser, canEditShifts } = useAuth()
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)

  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate])
  const weekDates = useMemo(() => getWeekDatesUtil(selectedDate), [selectedDate])

  const { data: teams = [] } = useQuery<any[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await axiosInstance.get('/api/teams')
      return Array.isArray(response.data) ? response.data : []
    },
  })

  useEffect(() => {
    if (teams.length === 0) return
    const fromUrl = searchParams.get(TEAM_ID_PARAM)
    const validId = fromUrl && teams.some((t: { id: string }) => t.id === fromUrl) ? fromUrl : null
    const nextId = validId ?? teams[0].id
    if (!selectedTeamId) {
      setSelectedTeamId(nextId)
    }
    if (!validId || fromUrl !== nextId) {
      const params = new URLSearchParams(searchParams.toString())
      params.set(TEAM_ID_PARAM, nextId)
      router.replace(`/standard?${params.toString()}`, { scroll: false })
    }
  }, [teams, searchParams, router, selectedTeamId])

  // Hent kun ansatte som tilhører valgt team (via TeamMembership)
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['users', selectedTeamId],
    queryFn: async () => {
      const response = await axiosInstance.get(`/api/users?teamId=${selectedTeamId}`)
      const list = Array.isArray(response.data) ? response.data : []
      return list.filter((u: any) => u.role !== 'ADMIN')
    },
    enabled: Boolean(selectedTeamId),
  })

  const startDate = format(weekStart, 'yyyy-MM-dd')
  const endDate = format(weekDates[6], 'yyyy-MM-dd')
  const { data: shifts = [] } = useQuery<any[]>({
    queryKey: ['shifts', selectedTeamId, startDate, endDate],
    queryFn: async () => {
      const response = await axiosInstance.get(
        `/api/shifts?teamId=${selectedTeamId}&dateFrom=${startDate}&dateTo=${endDate}`
      )
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: Boolean(selectedTeamId),
  })

  const futureDateFrom = format(selectedDate, 'yyyy-MM-dd')
  const futureDateTo = format(addDays(selectedDate, 365), 'yyyy-MM-dd')
  const { data: futureShifts = [] } = useQuery<any[]>({
    queryKey: ['shifts', selectedTeamId, selectedUserId, futureDateFrom, futureDateTo],
    queryFn: async () => {
      const response = await axiosInstance.get(
        `/api/shifts?teamId=${selectedTeamId}&userId=${selectedUserId}&dateFrom=${futureDateFrom}&dateTo=${futureDateTo}`
      )
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: Boolean(selectedTeamId && selectedUserId),
  })

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

  const selectedUser = useMemo(
    () => users.find(user => user.id === selectedUserId) || null,
    [users, selectedUserId]
  )

  const futureShiftTimeline = useMemo(() => {
    if (!selectedUserId || futureShifts.length === 0) return []

    const sorted = [...futureShifts].sort((a, b) => a.date.localeCompare(b.date) || a.startDateTime.localeCompare(b.startDateTime))
    const entries: Array<
      | { type: 'shift'; shift: any }
      | { type: 'free'; from: string; to: string }
    > = []

    const timelineStart = format(selectedDate, 'yyyy-MM-dd')
    let previousShiftDate = timelineStart

    sorted.forEach((shift, index) => {
      const gapDays = differenceInCalendarDays(parseISO(shift.date), parseISO(previousShiftDate))

      if (index === 0) {
        const startGapDays = differenceInCalendarDays(parseISO(shift.date), parseISO(timelineStart))
        if (startGapDays >= 7) {
          entries.push({
            type: 'free',
            from: timelineStart,
            to: format(addDays(parseISO(shift.date), -1), 'yyyy-MM-dd'),
          })
        }
      } else if (gapDays >= 7) {
        entries.push({
          type: 'free',
          from: format(addDays(parseISO(previousShiftDate), 1), 'yyyy-MM-dd'),
          to: format(addDays(parseISO(shift.date), -1), 'yyyy-MM-dd'),
        })
      }

      entries.push({ type: 'shift', shift })
      previousShiftDate = shift.date
    })

    return entries
  }, [futureShifts, selectedUserId, selectedDate])

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
          {canEditShifts() && selectedTeamId && (
            <Button variant="outline" onClick={() => setIsBulkModalOpen(true)}>
              Endre vakt
            </Button>
          )}
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

        <div className="text-sm text-muted-foreground">
          Viser {filteredUsers.length} av {users.length} ansatte
        </div>

        <div className="flex items-center gap-2 min-w-[220px]">
          <label className="text-sm font-medium">Plan:</label>
          <select
            value={selectedTeamId}
            onChange={(e) => {
              const id = e.target.value
              setSelectedTeamId(id)
              const params = new URLSearchParams(searchParams.toString())
              params.set(TEAM_ID_PARAM, id)
              router.replace(`/standard?${params.toString()}`, { scroll: false })
            }}
            className="px-3 py-1 rounded-md border bg-background text-foreground"
          >
            {Array.isArray(teams) && teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedUser && selectedUserId && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Fremtidige vakter for {selectedUser.name}</h2>
            <p className="text-sm text-muted-foreground">
              Viser alle vakter fremover i tid, med fri-perioder på minst én uke markert.
            </p>
          </div>

          <div className="space-y-2">
            {futureShiftTimeline.length === 0 ? (
              <div className="text-sm text-muted-foreground">Ingen fremtidige vakter funnet.</div>
            ) : (
              futureShiftTimeline.map((entry, index) => {
                if (entry.type === 'free') {
                  return (
                    <div key={`free-${index}`} className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 p-3 text-sm text-muted-foreground">
                      Fri fra {format(parseISO(entry.from), 'dd.MM.yyyy')} til {format(parseISO(entry.to), 'dd.MM.yyyy')}
                    </div>
                  )
                }

                return (
                  <div key={entry.shift.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{format(parseISO(entry.shift.date), 'dd.MM.yyyy')}</div>
                        <div className="text-sm text-muted-foreground">
                          {entry.shift.shiftType?.label} · {format(new Date(entry.shift.startDateTime), 'HH:mm')} - {format(new Date(entry.shift.endDateTime), 'HH:mm')}
                        </div>
                      </div>
                      <div
                        className="rounded-md px-2 py-1 text-xs font-semibold"
                        style={getShiftChipStyle(entry.shift.shiftType?.color || '#999999')}
                        title={entry.shift.shiftType?.label}
                      >
                        {entry.shift.shiftType?.code || 'Vakt'}
                      </div>
                    </div>
                    {entry.shift.comment && (
                      <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {entry.shift.comment}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      <WeekGrid
        weekDates={weekDates}
        users={filteredUsers}
        shifts={shifts}
        currentUser={currentUser}
        onSelectUser={setSelectedUserId}
        highlightedUserId={selectedUserId}
      />

      {isBulkModalOpen && selectedTeamId && (
        <BulkShiftModal
          teamId={selectedTeamId}
          onClose={() => setIsBulkModalOpen(false)}
        />
      )}
    </div>
  )
}

