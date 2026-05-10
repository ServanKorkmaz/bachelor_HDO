"use client"

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { axiosInstance } from '@/lib/axios'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth/mockAuth'
import { formatDateDisplay } from '@/lib/date-utils'
import { getShiftChipStyle } from '@/lib/shift-colors'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { holidayTypeToNorwegian } from '@/lib/i18n'

/** Agenda view showing upcoming shifts and notes. */
export default function AgendaPage() {
  const [shifts, setShifts] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  // Use a non-empty sentinel for 'all' to satisfy Radix SelectItem requirements
  const [selectedUserId, setSelectedUserId] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const { currentUser } = useAuth()

  const { data: fetchedTeams = [] } = useQuery<any[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/teams')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  useEffect(() => {
    setTeams(Array.isArray(fetchedTeams) ? fetchedTeams : [])
    if (Array.isArray(fetchedTeams) && fetchedTeams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(fetchedTeams[0].id)
    }
  }, [fetchedTeams, selectedTeamId])

  const { data: fetchedUsers = [] } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/users')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  useEffect(() => {
    setUsers(Array.isArray(fetchedUsers) ? fetchedUsers : [])
  }, [fetchedUsers])

  const today = format(new Date(), 'yyyy-MM-dd')
  const futureDate = format(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')

  const { data: fetchedShifts = [] } = useQuery<any[]>({
    queryKey: ['shifts', selectedTeamId, today, futureDate],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/shifts?teamId=${selectedTeamId}&dateFrom=${today}&dateTo=${futureDate}`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(selectedTeamId),
  })

  const { data: fetchedNotes = [] } = useQuery<any[]>({
    queryKey: ['notes', selectedTeamId, today, futureDate],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/notes?teamId=${selectedTeamId}&dateFrom=${today}&dateTo=${futureDate}`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(selectedTeamId),
  })

  useEffect(() => {
    setShifts(Array.isArray(fetchedShifts) ? fetchedShifts : [])
  }, [fetchedShifts])

  useEffect(() => {
    setNotes(Array.isArray(fetchedNotes) ? fetchedNotes : [])
  }, [fetchedNotes])

  const filteredShifts = useMemo(() => {
    let filtered = shifts

    if (selectedUserId && selectedUserId !== 'all') {
      filtered = filtered.filter((s: any) => s.userId === selectedUserId)
    }

    return filtered.sort((a: any, b: any) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return a.startDateTime.localeCompare(b.startDateTime)
    })
  }, [shifts, selectedUserId])

  const filteredNotes = useMemo(() => {
    let filtered = notes

    if (selectedType !== 'all') {
      filtered = filtered.filter((n: any) => n.type === selectedType)
    }

    if (selectedUserId && selectedUserId !== 'all') {
      filtered = filtered.filter((n: any) => n.createdByUserId === selectedUserId)
    }

    return filtered.sort((a: any, b: any) => {
      return a.dateFrom.localeCompare(b.dateFrom)
    })
  }, [notes, selectedType, selectedUserId])

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Agenda</h1>

      <div className="flex flex-wrap items-center gap-4 p-4 bg-card rounded-lg border">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Plan:</label>
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Velg plan" />
            </SelectTrigger>
            <SelectContent>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Ansatt:</label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Type:</label>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="GENERAL">Generelt</SelectItem>
              <SelectItem value="ABSENCE">Fravær</SelectItem>
              <SelectItem value="SICKNESS">Sykdom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-4">Kommende vakter</h2>
          <div className="space-y-2">
            {filteredShifts.length === 0 ? (
              <p className="text-muted-foreground">Ingen kommende vakter</p>
            ) : (
              filteredShifts.map((shift: any) => (
                <div
                  key={shift.id}
                  className="p-4 bg-card rounded-lg border flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="font-medium">{shift.user.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateDisplay(shift.date)} - {shift.shiftType.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(shift.startDateTime), 'HH:mm')} - {format(new Date(shift.endDateTime), 'HH:mm')}
                    </div>
                  </div>
                  <div
                    className="h-7 w-7 rounded-md"
                    style={getShiftChipStyle(shift.shiftType.color)}
                  />
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Notater</h2>
          <div className="space-y-2">
            {filteredNotes.length === 0 ? (
              <p className="text-muted-foreground">Ingen notater</p>
            ) : (
              filteredNotes.map((note: any) => (
                <div
                  key={note.id}
                  className="p-4 bg-card rounded-lg border"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium">{note.title || 'Ingen tittel'}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          note.type === 'ABSENCE' ? 'bg-yellow-500/20 text-yellow-500' :
                          note.type === 'SICKNESS' ? 'bg-red-500/20 text-red-500' :
                          'bg-blue-500/20 text-blue-500'
                        }`}>
                          {holidayTypeToNorwegian(note.type)}
                        </span>
                        {note.status === 'PENDING' && (
                          <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-500">
                            Venter på godkjenning
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">
                        {formatDateDisplay(note.dateFrom)} - {formatDateDisplay(note.dateTo)}
                      </div>
                      <div className="text-sm">{note.body}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

