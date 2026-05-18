"use client"

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { addDays, addWeeks, format, parseISO, subWeeks } from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import { ChevronLeft, ChevronRight, Pencil, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { axiosInstance } from '@/lib/axios'
import { useMe } from '@/lib/hooks/useMe'
import {
  formatDateDisplay,
  fromIsoWeek,
  getIsoWeek,
  getWeekDates,
  getWeekStart,
  DATE_FORMAT,
} from '@/lib/date-utils'
import { getShiftChipStyle } from '@/lib/shift-colors'
import { holidayTypeToNorwegian } from '@/lib/i18n'

const WEEKS_VISIBLE = 4 // four weeks per page — matches old HDO Agenda pattern

type TeamSummary = { id: string; name: string }
type UserSummary = { id: string; name: string; teamId?: string }
type ShiftType = { id: string; code: string; label: string; color: string }
type Shift = {
  id: string
  userId: string
  date: string
  startDateTime: string
  endDateTime: string
  shiftType: ShiftType
  comment?: string | null
}
type HolidayRequest = {
  id: string
  userId: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  type: string
  dateFrom: string
  dateTo: string | null
}
type WeekNote = {
  id: string
  teamId: string
  userId: string
  isoYear: number
  isoWeek: number
  body: string
}

/** Agenda page — per-employee weekly view with editable "fokus for uka" notes
 * above each week card. The selected employee, team and reference date are
 * persisted in the URL so a shared link reproduces the same view. */
export default function AgendaPage() {
  const { data: me } = useMe()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const canSwitchEmployee = me?.role === 'ADMIN' || me?.role === 'LEADER'

  // URL-backed state: ?employee, ?date, ?teamId. Defaults applied once the
  // initial team list / current user resolves.
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const dateParam = searchParams.get('date')
    const parsed = dateParam ? parseISO(dateParam) : new Date()
    return getWeekStart(Number.isNaN(parsed.getTime()) ? new Date() : parsed)
  })

  const weeks = useMemo(() => {
    return Array.from({ length: WEEKS_VISIBLE }, (_, i) => {
      const monday = addWeeks(anchorDate, i)
      const iso = getIsoWeek(monday)
      const dates = getWeekDates(monday)
      return { monday, isoYear: iso.year, isoWeek: iso.week, dates }
    })
  }, [anchorDate])

  // Compute the date range we need shifts/holidays for so the queries can be
  // cached and not re-fetch on every render.
  const rangeStart = weeks[0].dates[0]
  const rangeEnd = weeks[weeks.length - 1].dates[6]
  const rangeStartStr = format(rangeStart, DATE_FORMAT)
  const rangeEndStr = format(rangeEnd, DATE_FORMAT)

  // === Data fetching ===
  const { data: teams = [] } = useQuery<TeamSummary[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/teams')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const { data: users = [] } = useQuery<UserSummary[]>({
    queryKey: ['users', selectedTeamId],
    queryFn: async () => {
      const url = selectedTeamId ? `/api/users?teamId=${selectedTeamId}` : '/api/users'
      const res = await axiosInstance.get(url)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(me),
  })

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ['agenda-shifts', selectedTeamId, selectedUserId, rangeStartStr, rangeEndStr],
    queryFn: async () => {
      if (!selectedTeamId || !selectedUserId) return []
      const res = await axiosInstance.get(
        `/api/shifts?teamId=${selectedTeamId}&dateFrom=${rangeStartStr}&dateTo=${rangeEndStr}`,
      )
      const all: Shift[] = Array.isArray(res.data) ? res.data : []
      return all.filter((s) => s.userId === selectedUserId)
    },
    enabled: Boolean(selectedTeamId && selectedUserId),
  })

  const { data: holidayRequests = [] } = useQuery<HolidayRequest[]>({
    queryKey: ['agenda-holidays', selectedTeamId, selectedUserId],
    queryFn: async () => {
      if (!selectedTeamId) return []
      const res = await axiosInstance.get(`/api/holiday-requests?teamId=${selectedTeamId}`)
      const all: HolidayRequest[] = Array.isArray(res.data) ? res.data : []
      return all.filter((r) => r.userId === selectedUserId && r.status === 'APPROVED')
    },
    enabled: Boolean(selectedTeamId && selectedUserId),
  })

  const { data: weekNotes = [] } = useQuery<WeekNote[]>({
    queryKey: [
      'week-notes',
      selectedTeamId,
      selectedUserId,
      weeks[0].isoYear,
      weeks[0].isoWeek,
      weeks[weeks.length - 1].isoYear,
      weeks[weeks.length - 1].isoWeek,
    ],
    queryFn: async () => {
      if (!selectedTeamId || !selectedUserId) return []
      const params = new URLSearchParams({
        teamId: selectedTeamId,
        userId: selectedUserId,
        fromYear: String(weeks[0].isoYear),
        fromWeek: String(weeks[0].isoWeek),
        toYear: String(weeks[weeks.length - 1].isoYear),
        toWeek: String(weeks[weeks.length - 1].isoWeek),
      })
      const res = await axiosInstance.get(`/api/week-notes?${params.toString()}`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(selectedTeamId && selectedUserId),
  })

  // === Initial defaults ===
  useEffect(() => {
    if (!me) return
    if (selectedTeamId) return
    const urlTeam = searchParams.get('teamId')
    if (urlTeam && teams.some((t) => t.id === urlTeam)) {
      setSelectedTeamId(urlTeam)
    } else if (me.teamId) {
      setSelectedTeamId(me.teamId)
    } else if (teams.length > 0) {
      setSelectedTeamId(teams[0].id)
    }
  }, [me, teams, selectedTeamId, searchParams])

  useEffect(() => {
    if (!me) return
    if (selectedUserId) return
    const urlUser = searchParams.get('employee')
    // Employees can only view themselves. The server-side authorization is the
    // real gate; this just keeps the UI honest.
    if (urlUser && canSwitchEmployee && users.some((u) => u.id === urlUser)) {
      setSelectedUserId(urlUser)
    } else {
      setSelectedUserId(me.id)
    }
  }, [me, users, selectedUserId, searchParams, canSwitchEmployee])

  // Keep the URL in sync so refresh/share reproduces the view.
  useEffect(() => {
    if (!selectedTeamId || !selectedUserId) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('teamId', selectedTeamId)
    params.set('employee', selectedUserId)
    params.set('date', format(anchorDate, DATE_FORMAT))
    const next = params.toString()
    if (next !== searchParams.toString()) {
      router.replace(`/agenda?${next}`, { scroll: false })
    }
  }, [selectedTeamId, selectedUserId, anchorDate, router, searchParams])

  // === Derived maps for fast per-day lookup ===
  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift>()
    for (const s of shifts) map.set(s.date, s)
    return map
  }, [shifts])

  const holidayForDate = (dateStr: string): HolidayRequest | null => {
    for (const r of holidayRequests) {
      const to = r.dateTo ?? r.dateFrom
      if (dateStr >= r.dateFrom && dateStr <= to) return r
    }
    return null
  }

  const weekNoteFor = (isoYear: number, isoWeek: number): WeekNote | undefined =>
    weekNotes.find((n) => n.isoYear === isoYear && n.isoWeek === isoWeek)

  // === Save week note ===
  const upsertWeekNote = useMutation({
    mutationFn: async (input: { isoYear: number; isoWeek: number; body: string }) => {
      await axiosInstance.put('/api/week-notes', {
        teamId: selectedTeamId,
        userId: selectedUserId,
        isoYear: input.isoYear,
        isoWeek: input.isoWeek,
        body: input.body,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['week-notes', selectedTeamId, selectedUserId] })
      toast({ title: 'Lagret', description: 'Ukenotat oppdatert.' })
    },
    onError: () => {
      toast({
        title: 'Kunne ikke lagre',
        description: 'Prøv igjen, eller kontakt en administrator.',
        variant: 'destructive',
      })
    },
  })

  if (!me) {
    return <div role="status" aria-live="polite" className="text-muted-foreground p-8">Laster…</div>
  }

  const selectedUser = users.find((u) => u.id === selectedUserId)
  const selectedTeam = teams.find((t) => t.id === selectedTeamId)
  // Leaders/admins can edit any team member's notes; employees can edit only
  // their own. The server-side check is the real gate; this just keeps the
  // pencil button from appearing when it would 403.
  const canEditWeekNotes =
    me.role === 'ADMIN' || me.role === 'LEADER' || me.id === selectedUserId

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agenda</h1>
          <p className="text-muted-foreground mt-1">
            Ukentlig oversikt for{' '}
            <span className="font-medium text-foreground">{selectedUser?.name ?? '...'}</span>
            {selectedTeam ? ` · ${selectedTeam.name}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setAnchorDate(subWeeks(anchorDate, WEEKS_VISIBLE))}
            aria-label="Forrige periode"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAnchorDate(getWeekStart(new Date()))}
          >
            I dag
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setAnchorDate(addWeeks(anchorDate, WEEKS_VISIBLE))}
            aria-label="Neste periode"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {canSwitchEmployee && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" id="agenda-user-label">Ansatt</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[220px]" aria-labelledby="agenda-user-label">
                <SelectValue placeholder="Velg ansatt" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {teams.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" id="agenda-team-label">Team</label>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-[200px]" aria-labelledby="agenda-team-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {weeks.map((w) => (
          <WeekCard
            key={`${w.isoYear}-${w.isoWeek}`}
            isoYear={w.isoYear}
            isoWeek={w.isoWeek}
            dates={w.dates}
            note={weekNoteFor(w.isoYear, w.isoWeek)}
            canEdit={canEditWeekNotes}
            onSaveNote={(body) =>
              upsertWeekNote.mutate({ isoYear: w.isoYear, isoWeek: w.isoWeek, body })
            }
            shiftsByDate={shiftsByDate}
            holidayFor={holidayForDate}
          />
        ))}
      </div>
    </div>
  )
}

// === Week card ===

interface WeekCardProps {
  isoYear: number
  isoWeek: number
  dates: Date[]
  note: WeekNote | undefined
  canEdit: boolean
  onSaveNote: (body: string) => void
  shiftsByDate: Map<string, Shift>
  holidayFor: (date: string) => HolidayRequest | null
}

function WeekCard({
  isoYear,
  isoWeek,
  dates,
  note,
  canEdit,
  onSaveNote,
  shiftsByDate,
  holidayFor,
}: WeekCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const monday = dates[0]
  const sunday = dates[6]

  const handleStartEdit = () => {
    setDraft(note?.body ?? '')
    setEditing(true)
  }

  const handleSave = () => {
    onSaveNote(draft)
    setEditing(false)
  }

  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <header className="border-b bg-muted/40 px-4 py-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          Uke {isoWeek} – {isoYear}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {format(monday, 'dd.MM.', { locale: nb })} – {format(sunday, 'dd.MM.yyyy', { locale: nb })}
          </span>
        </div>
        {canEdit && !editing && (
          <Button type="button" size="sm" variant="ghost" onClick={handleStartEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            {note ? 'Rediger ukenotat' : 'Legg til ukenotat'}
          </Button>
        )}
      </header>

      {editing ? (
        <div className="px-4 py-3 bg-muted/20 border-b space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Fokus for uka, instruks, eller annen relevant info."
            rows={3}
            maxLength={1000}
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5 mr-1" />
              Avbryt
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" />
              Lagre
            </Button>
          </div>
        </div>
      ) : (
        note?.body && (
          <div className="px-4 py-3 bg-muted/20 border-b text-sm whitespace-pre-wrap">
            {note.body}
          </div>
        )
      )}

      <ul className="divide-y">
        {dates.map((date) => {
          const dateStr = format(date, DATE_FORMAT)
          const shift = shiftsByDate.get(dateStr)
          const holiday = holidayFor(dateStr)
          return (
            <DayRow key={dateStr} date={date} shift={shift} holiday={holiday} />
          )
        })}
      </ul>
    </section>
  )
}

// === Day row ===

interface DayRowProps {
  date: Date
  shift: Shift | undefined
  holiday: HolidayRequest | null
}

function DayRow({ date, shift, holiday }: DayRowProps) {
  const weekday = format(date, 'EEEE', { locale: nb })
  const dateLabel = formatDateDisplay(date)
  const struckOut = Boolean(holiday)

  return (
    <li className="flex items-center gap-4 px-4 py-2">
      <div className="w-32 shrink-0">
        <div className="text-sm font-medium capitalize">{weekday}</div>
        <div className="text-xs text-muted-foreground">{dateLabel}</div>
      </div>

      {shift ? (
        <div className="flex flex-1 items-center gap-3">
          <span
            className="inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium"
            style={getShiftChipStyle(shift.shiftType.color)}
          >
            {format(new Date(shift.startDateTime), 'HH:mm')} –{' '}
            {format(new Date(shift.endDateTime), 'HH:mm')}
          </span>
          <span className={`text-sm ${struckOut ? 'line-through opacity-70' : ''}`}>
            {shift.shiftType.label}
          </span>
          {holiday && (
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {holidayTypeToNorwegian(holiday.type)}
            </span>
          )}
          {shift.comment && (
            <span className="text-xs italic text-muted-foreground">{shift.comment}</span>
          )}
        </div>
      ) : holiday ? (
        <div className="flex flex-1 items-center gap-2">
          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {holidayTypeToNorwegian(holiday.type)}
          </span>
          <span className="text-sm text-muted-foreground">Hele dagen</span>
        </div>
      ) : (
        <div className="flex-1 text-sm text-muted-foreground italic">Fri</div>
      )}
    </li>
  )
}
