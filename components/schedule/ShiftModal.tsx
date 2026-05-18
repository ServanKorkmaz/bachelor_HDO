"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO, subDays } from 'date-fns'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatTime, formatDateDisplay, formatDayName } from '@/lib/date-utils'
import { axiosInstance } from '@/lib/axios'
import {
  evaluateShiftIssues,
  type IssueHoliday,
  type IssueShift,
  type ShiftIssues,
} from '@/lib/domain/shift-issues'
import { buildShiftDateTimes, ShiftTimeError } from '@/lib/shifts/time'
import { useMe, type Me } from '@/lib/hooks/useMe'
import { ShiftIssueBanner } from './ShiftIssueIndicator'

const PREVIEW_TARGET_ID = '__preview__'
const EMPTY_ISSUES: ShiftIssues = { hardConflict: null, warnings: [] }

/** Shift type metadata used for labeling and default times. */
export interface ShiftType {
  id: string
  code: string
  label: string
  color: string
  defaultStartTime: string
  defaultEndTime: string
  crossesMidnight: boolean
}

/** Shift domain model used by the schedule UI. */
export interface Shift {
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

// Re-export Me for parent components that pass currentUser. Shape lives in
// the shared useMe hook.
export type { Me } from '@/lib/hooks/useMe'

interface ShiftModalProps {
  shift: Shift | null
  date: string | null
  userId: string | null
  onClose: () => void
  currentUser: Me | null
}

/** Modal for viewing, creating, or updating a single shift. */
export function ShiftModal({ shift, date, userId, onClose, currentUser }: ShiftModalProps) {
  // Use the me query only as a fallback when the parent hasn't passed
  // currentUser. The parent (WeekGrid / page) already calls useMe() and
  // passes the result in, so this avoids a race where me is undefined for
  // the first render cycle and canEditShifts is incorrectly false (hiding
  // the Lagre button before the query resolves).
  const { data: meFromQuery } = useMe()
  const me = currentUser ?? meFromQuery
  const canEditShifts = me?.role === 'ADMIN' || me?.role === 'LEADER'
  const queryClient = useQueryClient()
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>(userId || '')
  const [startTime, setStartTime] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('')
  const [comment, setComment] = useState<string>('')
  const [userQuery, setUserQuery] = useState('')
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const userDropdownRef = useRef<HTMLDivElement | null>(null)

  // Fetch shift types
  const { data: shiftTypes = [] } = useQuery<ShiftType[]>({
    queryKey: ['shift-types'],
    queryFn: () => axiosInstance.get('/api/shift-types').then(res => res.data),
  })

  // Fetch users
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: () => axiosInstance.get('/api/users').then(res => res.data),
  })

  // ---- AML §10-8 client-side preview ----
  // Mirrors the server-side check in lib/services/shift-service.ts so the
  // leader sees a banner with the exact rule before submitting, instead of
  // getting a 422 back from the API. The server remains authoritative — this
  // is purely a UX shortcut.

  const effectiveDate = shift?.date ?? date
  const teamId = currentUser?.teamId

  const selectedShiftType = useMemo(
    () => shiftTypes.find((t) => t.id === selectedShiftTypeId) ?? null,
    [shiftTypes, selectedShiftTypeId]
  )

  const windowDates = useMemo(() => {
    if (!effectiveDate) return null
    const d = parseISO(effectiveDate)
    return {
      from: format(subDays(d, 14), 'yyyy-MM-dd'),
      to: format(addDays(d, 1), 'yyyy-MM-dd'),
    }
  }, [effectiveDate])

  const { data: neighbourShifts = [] } = useQuery<Shift[]>({
    queryKey: ['shifts-window', teamId, selectedUserId, windowDates?.from, windowDates?.to],
    enabled: Boolean(teamId && selectedUserId && windowDates),
    queryFn: () =>
      axiosInstance
        .get(
          `/api/shifts?teamId=${teamId}&userId=${selectedUserId}&dateFrom=${windowDates!.from}&dateTo=${windowDates!.to}`
        )
        .then((res) => res.data),
  })

  const { data: holidayRequests = [] } = useQuery<Array<{
    id: string
    userId: string
    status: string
    dateFrom: string
    dateTo: string | null
  }>>({
    queryKey: ['holiday-requests', teamId],
    enabled: Boolean(teamId),
    queryFn: () => axiosInstance.get(`/api/holiday-requests?teamId=${teamId}`).then((res) => res.data),
  })

  const issues: ShiftIssues = useMemo(() => {
    if (!effectiveDate || !selectedShiftType || !startTime || !endTime || !selectedUserId) {
      return EMPTY_ISSUES
    }
    let times
    try {
      times = buildShiftDateTimes({
        date: effectiveDate,
        startTime,
        endTime,
        shiftType: selectedShiftType,
      })
    } catch (e) {
      // Bad time input (e.g. start === end on a non-overnight type) — let the
      // existing time validation report that, not the AML banner.
      if (e instanceof ShiftTimeError) return EMPTY_ISSUES
      throw e
    }
    const target: IssueShift = {
      id: shift?.id ?? PREVIEW_TARGET_ID,
      date: effectiveDate,
      startDateTime: times.startDateTime,
      endDateTime: times.endDateTime,
    }
    const others: IssueShift[] = neighbourShifts.map((s) => ({
      id: s.id,
      date: s.date,
      startDateTime: new Date(s.startDateTime),
      endDateTime: new Date(s.endDateTime),
    }))
    const userHolidays: IssueHoliday[] = holidayRequests
      .filter((h) => h.userId === selectedUserId && h.status === 'APPROVED')
      .map((h) => ({ id: h.id, dateFrom: h.dateFrom, dateTo: h.dateTo }))
    return evaluateShiftIssues(target, others, userHolidays)
  }, [
    effectiveDate,
    selectedShiftType,
    startTime,
    endTime,
    selectedUserId,
    neighbourShifts,
    holidayRequests,
    shift?.id,
  ])

  // Save shift mutation (POST or PUT)
  const saveShiftMutation = useMutation({
    mutationFn: async (shiftData: any) => {
      const url = shift ? `/api/shifts/${shift.id}` : '/api/shifts'
      const method = shift ? 'PUT' : 'POST'

      const response = await axiosInstance({
        method,
        url,
        data: shiftData,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      onClose()
    },
    onError: (error: unknown) => {
      // Surface the server's message (e.g. AML §10-8 violation text) instead
      // of a generic "Kunne ikke lagre vakt", so the leader sees the same
      // explanation the banner shows.
      const fallback = 'Kunne ikke lagre vakt'
      let message = fallback
      if (error && typeof error === 'object' && 'response' in error) {
        const resp = (error as { response?: { data?: { error?: string } } }).response
        if (typeof resp?.data?.error === 'string') {
          message = resp.data.error
        }
      }
      alert(message)
    },
  })

  // Delete shift mutation
  const deleteShiftMutation = useMutation({
    mutationFn: async () => {
      const response = await axiosInstance({
        method: 'DELETE',
        url: `/api/shifts/${shift!.id}`,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      onClose()
    },
    onError: () => {
      alert('Kunne ikke slette vakt')
    },
  })

  useEffect(() => {
    if (shift) {
      setSelectedShiftTypeId(shift.shiftType.id)
      setSelectedUserId(shift.userId)
      setUserQuery(shift.user.name)
      setStartTime(formatTime(shift.startDateTime))
      setEndTime(formatTime(shift.endDateTime))
      setComment(shift.comment || '')
    } else if (date && shiftTypes.length > 0) {
      // Default to first shift type
      const defaultType = shiftTypes[0]
      setSelectedShiftTypeId(defaultType.id)
      setStartTime(defaultType.defaultStartTime)
      setEndTime(defaultType.defaultEndTime)
    }
  }, [shift, date, shiftTypes])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (userDropdownRef.current && target && !userDropdownRef.current.contains(target)) {
        setIsUserDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSave = async () => {
    const effectiveDate = shift?.date ?? date
    if (!effectiveDate || !selectedShiftTypeId || !selectedUserId) return

    const shiftData = {
      date: effectiveDate,
      userId: selectedUserId,
      shiftTypeId: selectedShiftTypeId,
      startTime,
      endTime,
      comment: comment || undefined,
    }

    saveShiftMutation.mutate(shiftData)
  }

  const handleDelete = async () => {
    if (!shift) return
    if (!confirm('Er du sikker på at du vil slette denne vakten?')) return
    deleteShiftMutation.mutate()
  }

  const displayDate = shift ? shift.date : date
  const displayUser = shift
    ? shift.user.name
    : users.find(u => u.id === userId)?.name || ''

  const normalizedUsers = useMemo(() => {
    return users
      .filter((u) => typeof u?.id === 'string' && typeof u?.name === 'string')
      .map((u) => ({ ...u, id: u.id as string, name: u.name as string }))
  }, [users])

  const usersForPicker = useMemo(() => {
    const query = userQuery.trim().toLowerCase()
    if (!query) return normalizedUsers
    return normalizedUsers.filter(u => u.name.toLowerCase().includes(query))
  }, [normalizedUsers, userQuery])

  const selectedUserName = useMemo(() => {
    const selected = normalizedUsers.find(u => u.id === selectedUserId)
    return selected?.name ?? ''
  }, [normalizedUsers, selectedUserId])

  const handlePickUser = (nextUserId: string) => {
    const selected = normalizedUsers.find(u => u.id === nextUserId)
    setSelectedUserId(nextUserId)
    setUserQuery(selected?.name ?? '')
    setIsUserDropdownOpen(false)
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg flex flex-col max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Detaljer for dag {displayDate ? formatDateDisplay(displayDate) : ''}
          </DialogTitle>
          <DialogDescription>
            {displayDate && formatDayName(displayDate)}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0">
        <div className="grid gap-4 py-4">
          {canEditShifts && <ShiftIssueBanner issues={issues} />}

          <div className="grid gap-2">
            <Label>Dato</Label>
            <div className="p-3 bg-muted rounded-md text-sm font-medium">
              {displayDate ? `${formatDateDisplay(displayDate)} (${formatDayName(displayDate)})` : '-'}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2" ref={userDropdownRef}>
              <Label>Ansatt</Label>
              {canEditShifts ? (
                <div className="relative">
                  <Input
                    value={userQuery || selectedUserName}
                    onFocus={() => setIsUserDropdownOpen(true)}
                    onChange={(e) => {
                      setSelectedUserId('')
                      setUserQuery(e.target.value)
                      setIsUserDropdownOpen(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsUserDropdownOpen(false)
                      }
                      if (e.key === 'Enter' && usersForPicker.length > 0) {
                        e.preventDefault()
                        handlePickUser(usersForPicker[0].id)
                      }
                    }}
                    placeholder="Klikk for å velge eller skriv navn"
                  />
                  {isUserDropdownOpen && (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
                      {usersForPicker.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => handlePickUser(u.id)}
                          className="w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                        >
                          {u.name}
                        </button>
                      ))}
                      {usersForPicker.length === 0 && (
                        <div className="px-2 py-1 text-sm text-muted-foreground">
                          Ingen ansatte matcher søket
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-muted rounded-md">
                  {displayUser}
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Vakt</Label>
              {canEditShifts ? (
                <div className="space-y-2">
                  <Select value={selectedShiftTypeId} onValueChange={setSelectedShiftTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg vakttype" />
                    </SelectTrigger>
                    <SelectContent>
                      {shiftTypes.map(st => (
                        <SelectItem key={st.id} value={st.id}>
                          {st.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Start</Label>
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Slutt</Label>
                      <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : shift ? (
                <div className="p-3 bg-muted rounded-md">
                  <div className="font-medium">{shift.shiftType.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatTime(shift.startDateTime)} - {formatTime(shift.endDateTime)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {canEditShifts && (
            <div className="grid gap-2">
              <Label>Kommentar</Label>
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Legg til kommentar..."
              />
            </div>
          )}

          {shift && shift.comment && !canEditShifts && (
            <div className="grid gap-2">
              <Label>Kommentar</Label>
              <div className="p-3 bg-muted rounded-md text-sm">
                {shift.comment}
              </div>
            </div>
          )}
        </div>
        </div>

        <DialogFooter>
          {canEditShifts && (
            <>
              {shift && (
                <Button variant="destructive" onClick={handleDelete} disabled={deleteShiftMutation.isPending}>
                  Slett
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={saveShiftMutation.isPending || issues.hardConflict !== null}
                title={
                  issues.hardConflict !== null
                    ? 'Kan ikke lagre — vakten bryter en hard regel (se varsel over).'
                    : undefined
                }
              >
                {saveShiftMutation.isPending ? 'Lagrer...' : 'Lagre'}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onClose}>
            Lukk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

