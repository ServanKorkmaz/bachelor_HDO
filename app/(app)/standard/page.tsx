"use client"

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { format, addWeeks, subWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WeekGrid } from '@/components/schedule/WeekGrid'
import { BulkShiftModal } from '@/components/BulkShiftModal'
import { useAuth } from '@/lib/auth/mockAuth'
import { getWeekStart, getWeekDates as getWeekDatesUtil, formatDateDisplay, formatDayName } from '@/lib/date-utils'

const TEAM_ID_PARAM = 'teamId'

/** Standard weekly schedule view with team and user filters. Valgt team persisteres i URL så det overlever refresh. */
export default function StandardPlanPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [shifts, setShifts] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [visibleUserIds, setVisibleUserIds] = useState<string[]>([])
  const [showVisibleUsersPanel, setShowVisibleUsersPanel] = useState(false)
  const [visibleUsersSearch, setVisibleUsersSearch] = useState('')
  const { currentUser, canEditShifts } = useAuth()
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const isAdmin = currentUser?.role === 'ADMIN'

  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate])
  const weekDates = useMemo(() => getWeekDatesUtil(selectedDate), [selectedDate])

  useEffect(() => {
    fetch('/api/teams')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch teams')
        return res.json()
      })
      .then(data => {
        if (!Array.isArray(data)) {
          setTeams([])
          return
        }
        setTeams(data)
        if (data.length === 0) return
        const fromUrl = searchParams.get(TEAM_ID_PARAM)
        const validId = fromUrl && data.some((t: { id: string }) => t.id === fromUrl) ? fromUrl : null
        const nextId = validId ?? data[0].id
        setSelectedTeamId(nextId)
        if (!validId || fromUrl !== nextId) {
          const params = new URLSearchParams(searchParams.toString())
          params.set(TEAM_ID_PARAM, nextId)
          router.replace(`/standard?${params.toString()}`, { scroll: false })
        }
      })
      .catch(error => {
        console.error('Error fetching teams:', error)
        setTeams([])
      })
  }, [])

  // Hent kun ansatte som tilhører valgt team (via TeamMembership)
  useEffect(() => {
    if (!selectedTeamId) {
      setUsers([])
      setVisibleUserIds([])
      return
    }
    fetch(`/api/users?teamId=${selectedTeamId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch users')
        return res.json()
      })
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(error => {
        console.error('Error fetching users:', error)
        setUsers([])
      })
  }, [selectedTeamId])

  useEffect(() => {
    if (!Array.isArray(users) || users.length === 0) {
      setVisibleUserIds([])
      return
    }

    setVisibleUserIds(prev => {
      const allowed = new Set(users.map(u => u.id))
      const kept = prev.filter(id => allowed.has(id))
      return kept.length > 0 ? kept : users.map(u => u.id)
    })
  }, [users])

  useEffect(() => {
    if (!selectedUserId) return
    if (!users.some((u: any) => u.id === selectedUserId)) {
      setSelectedUserId('')
    }
  }, [selectedUserId, users])

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
    const baseUsers = isAdmin
      ? users.filter(u => visibleUserIds.includes(u.id))
      : users

    if (!selectedUserId) return baseUsers
    return baseUsers.filter(u => u.id === selectedUserId)
  }, [users, selectedUserId, isAdmin, visibleUserIds])

  const toggleVisibleUser = (userId: string, checked: boolean) => {
    setVisibleUserIds(prev => {
      if (checked) {
        if (prev.includes(userId)) return prev
        return [...prev, userId]
      }
      return prev.filter(id => id !== userId)
    })
  }

  const filteredVisibilityUsers = useMemo(() => {
    const query = visibleUsersSearch.trim().toLowerCase()
    if (!query) return users
    return users.filter((u: any) => u.name.toLowerCase().includes(query))
  }, [users, visibleUsersSearch])

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

        <div className="flex items-center gap-2">
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

        {isAdmin && (
          <div className="w-full border-t border-border pt-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Synlige ansatte i tabellen:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowVisibleUsersPanel(prev => !prev)}
              >
                {showVisibleUsersPanel ? 'Skjul panel' : 'Vis panel'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleUserIds(users.map((u: any) => u.id))}
              >
                Vis alle
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleUserIds([])}
              >
                Skjul alle
              </Button>
            </div>
            {showVisibleUsersPanel && (
              <div className="rounded-md border p-2">
                <input
                  type="text"
                  value={visibleUsersSearch}
                  onChange={(e) => setVisibleUsersSearch(e.target.value)}
                  placeholder="Søk etter ansatt..."
                  className="mb-2 w-full px-3 py-1 rounded-md border bg-background text-foreground"
                />
                <div className="max-h-36 overflow-y-auto">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredVisibilityUsers.map((u: any) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={visibleUserIds.includes(u.id)}
                          onChange={(e) => toggleVisibleUser(u.id, e.target.checked)}
                        />
                        <span>{u.name}</span>
                      </label>
                    ))}
                    {filteredVisibilityUsers.length === 0 && (
                      <div className="text-sm text-muted-foreground">Ingen ansatte funnet</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <WeekGrid
        weekDates={weekDates}
        users={filteredUsers}
        shifts={shifts}
        currentUser={currentUser}
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

