"use client"

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parse, subDays } from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth/mockAuth'
import { axiosInstance } from '@/lib/axios'

type BulkAction = 'create' | 'update' | 'delete'

interface BulkShiftModalProps {
  teamId: string
  onClose: () => void
}

interface ShiftType {
  id: string
  label: string
  defaultStartTime: string
  defaultEndTime: string
  crossesMidnight: boolean
}

interface UserSummary {
  id: string
  name: string
  teamId: string
}

interface BulkShiftRow {
  id: string
  shiftId?: string
  userId: string
  date: string
  shiftTypeId: string
  startTime: string
  endTime: string
  comment: string
  useCustomTime: boolean
}

const MAX_ROWS = 200
const SHIFT_LOOKBACK_DAYS = 30
const SHIFT_LOOKAHEAD_DAYS = 90

type ShiftFilter = 'upcoming' | 'past' | 'all'

const parseDate = (value: string) => parse(value, 'yyyy-MM-dd', new Date())

const formatShiftDate = (value: string) =>
  format(parseDate(value), 'EEE dd.MM', { locale: nb })

const formatShiftMonth = (value: string) =>
  format(parseDate(value), 'MMMM yyyy', { locale: nb })

interface EmployeeSelectProps {
  users: UserSummary[]
  value: string
  onChange: (value: string) => void
  isLoading: boolean
  error: string | null
}

function EmployeeSelect({ users, value, onChange, isLoading, error }: EmployeeSelectProps) {
  const [query, setQuery] = useState('')
  const selectedUser = useMemo(
    () => users.find((user) => user.id === value) ?? null,
    [users, value]
  )
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return users
    return users.filter(user => user.name.toLowerCase().includes(normalized))
  }, [query, users])

  return (
    <div className="grid gap-2">
      <Label>Ansatt</Label>
      <Input
        placeholder="Søk ansatt..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (!query && selectedUser) {
            setQuery(selectedUser.name)
          }
        }}
      />
      <div className="rounded-md border p-1">
        {isLoading && (
          <div className="px-2 py-1 text-sm text-muted-foreground">Laster ansatte...</div>
        )}
        {error && (
          <div className="px-2 py-1 text-sm text-destructive">Kunne ikke laste ansatte</div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="px-2 py-1 text-sm text-muted-foreground">Ingen treff</div>
        )}
        {!isLoading && !error && filtered.map(user => (
          <button
            key={user.id}
            type="button"
            onClick={() => {
              onChange(user.id)
              setQuery(user.name)
            }}
            className={`w-full rounded px-2 py-1 text-left text-sm transition-colors ${
              value === user.id ? 'bg-accent font-medium' : 'hover:bg-accent/70'
            }`}
          >
            {user.name}
          </button>
        ))}
      </div>
      {selectedUser && (
        <div className="text-xs text-muted-foreground">Valgt: {selectedUser.name}</div>
      )}
    </div>
  )
}

interface ShiftListItemProps {
  shift: any
  selected: boolean
  onSelect: () => void
}

function ShiftListItem({ shift, selected, onSelect }: ShiftListItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition-colors ${
        selected ? 'border-primary bg-primary/10' : 'hover:bg-accent'
      }`}
      aria-pressed={selected}
    >
      <div className="font-medium text-sm">{formatShiftDate(shift.date)}</div>
      <div className="text-xs text-muted-foreground">
        {shift.shiftType?.label || 'Vakt'} · {format(new Date(shift.startDateTime), 'HH:mm')}–
        {format(new Date(shift.endDateTime), 'HH:mm')}
      </div>
    </button>
  )
}

interface EmployeeShiftPickerProps {
  shifts: any[]
  selectedShiftId?: string
  onSelect: (shiftId: string) => void
  isLoading: boolean
  error: string | null
}

function EmployeeShiftPicker({
  shifts,
  selectedShiftId,
  onSelect,
  isLoading,
  error,
}: EmployeeShiftPickerProps) {
  const [filter, setFilter] = useState<ShiftFilter>('upcoming')
  const [query, setQuery] = useState('')
  const today = format(new Date(), 'yyyy-MM-dd')

  const filtered = useMemo(() => {
    let list = shifts
    if (filter === 'upcoming') {
      list = list.filter(shift => shift.date >= today)
      list = list.sort((a, b) => a.date.localeCompare(b.date))
    } else if (filter === 'past') {
      list = list.filter(shift => shift.date < today)
      list = list.sort((a, b) => b.date.localeCompare(a.date))
    } else {
      list = list.sort((a, b) => a.date.localeCompare(b.date))
    }

    const normalized = query.trim().toLowerCase()
    if (!normalized) return list
    return list.filter(shift => {
      const label = shift.shiftType?.label?.toLowerCase() || ''
      return shift.date.includes(normalized) || label.includes(normalized)
    })
  }, [filter, query, shifts, today])

  const grouped = useMemo(() => {
    const groups = new Map<string, any[]>()
    filtered.forEach(shift => {
      const month = formatShiftMonth(shift.date)
      if (!groups.has(month)) {
        groups.set(month, [])
      }
      groups.get(month)!.push(shift)
    })
    return Array.from(groups.entries())
  }, [filtered])

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFilter('upcoming')}
          className={filter === 'upcoming' ? 'bg-accent' : ''}
        >
          Kommende
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFilter('past')}
          className={filter === 'past' ? 'bg-accent' : ''}
        >
          Tidligere
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFilter('all')}
          className={filter === 'all' ? 'bg-accent' : ''}
        >
          Alle
        </Button>
        <Input
          placeholder="Søk dato eller vakttype..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-[260px]"
        />
      </div>

      <div className="rounded-md border p-3">
        {isLoading && (
          <div className="text-sm text-muted-foreground">Laster vakter...</div>
        )}
        {error && (
          <div className="text-sm text-destructive">Kunne ikke laste vakter</div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Ingen vakter i valgt filter
          </div>
        )}
        {!isLoading && !error && grouped.map(([month, monthShifts]) => (
          <div key={month} className="mb-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">{month}</div>
            <div className="grid gap-2">
              {monthShifts.map(shift => (
                <ShiftListItem
                  key={shift.id}
                  shift={shift}
                  selected={shift.id === selectedShiftId}
                  onSelect={() => onSelect(shift.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Modal for bulk create/update/delete of shifts across users and dates. */
export function BulkShiftModal({ teamId, onClose }: BulkShiftModalProps) {
  const { currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [action, setAction] = useState<BulkAction>('create')
  const [rows, setRows] = useState<BulkShiftRow[]>([])
  const [result, setResult] = useState<{
    successes: Array<{ userId: string; date: string; shiftId?: string }>
    failures: Array<{ userId: string; date: string; error: string }>
  } | null>(null)

  // Fetch shift types
  const { data: shiftTypes = [] } = useQuery<ShiftType[]>({
    queryKey: ['shift-types'],
    queryFn: () => axiosInstance.get('/api/shift-types').then(res => res.data),
  })

  // Fetch users
  const { data: users = [], isLoading: usersLoading, error: usersErrorObj } = useQuery<UserSummary[]>({
    queryKey: ['users'],
    queryFn: () => axiosInstance.get('/api/users').then(res => res.data),
  })

  const usersError = usersErrorObj ? 'Kunne ikke laste ansatte' : null

  // Fetch team shifts
  const { data: teamShifts = [], isLoading: shiftsLoading, error: shiftsErrorObj } = useQuery<any[]>({
    queryKey: ['shifts', teamId],
    queryFn: async () => {
      if (!teamId) return []
      const today = new Date()
      const dateFrom = format(subDays(today, SHIFT_LOOKBACK_DAYS), 'yyyy-MM-dd')
      const dateTo = format(new Date(today.getTime() + SHIFT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
      const response = await axiosInstance.get(`/api/shifts?teamId=${teamId}&dateFrom=${dateFrom}&dateTo=${dateTo}`)
      return response.data
    },
    enabled: !!teamId,
  })

  const shiftsError = shiftsErrorObj ? 'Kunne ikke laste vakter' : null

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await axiosInstance.post('/api/shifts/bulk', payload)
      return response.data
    },
    onSuccess: (data) => {
      const failures = data.failures?.length || 0
      const successes = data.successes?.length || 0
      if (failures > 0) {
        setResult({ successes: data.successes || [], failures: data.failures || [] })
        alert(`Fullført med ${successes} suksess(er) og ${failures} feil.`)
        return
      }
      setResult({ successes: data.successes || [], failures: [] })
      queryClient.invalidateQueries({ queryKey: ['shifts', teamId] })
      onClose()
    },
    onError: (error: any) => {
      alert(error?.response?.data?.error || 'Kunne ikke oppdatere vakter')
    },
  })

  const defaultShiftType = useMemo(() => shiftTypes[0] || null, [shiftTypes])
  const userNameById = useMemo(
    () => new Map(users.map(user => [user.id, user.name])),
    [users]
  )
  const teamUsers = useMemo(() => users.filter(user => user.teamId === teamId), [users, teamId])
  const shiftTypeById = useMemo(
    () => new Map(shiftTypes.map(shiftType => [shiftType.id, shiftType])),
    [shiftTypes]
  )
  const shiftsById = useMemo(
    () => new Map(teamShifts.map(shift => [shift.id, shift])),
    [teamShifts]
  )
  const shiftsPerDate = useMemo(() => {
    const map = new Map<string, number>()
    teamShifts.forEach(shift => {
      map.set(shift.date, (map.get(shift.date) || 0) + 1)
    })
    return map
  }, [teamShifts])

  const createRow = useCallback((): BulkShiftRow => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    shiftId: undefined,
    userId: '',
    date: '',
    shiftTypeId: defaultShiftType?.id || '',
    startTime: defaultShiftType?.defaultStartTime || '',
    endTime: defaultShiftType?.defaultEndTime || '',
    comment: '',
    useCustomTime: false,
  }), [defaultShiftType])

  useEffect(() => {
    if (!defaultShiftType || rows.length === 0) return
    setRows(prev =>
      prev.map(row => (
        row.shiftTypeId
          ? row
          : {
              ...row,
              shiftTypeId: defaultShiftType.id,
              startTime: defaultShiftType.defaultStartTime,
              endTime: defaultShiftType.defaultEndTime,
            }
      ))
    )
  }, [defaultShiftType, rows.length])

  useEffect(() => {
    if (shiftTypes.length > 0 && rows.length === 0) {
      setRows([createRow()])
    }
  }, [shiftTypes.length, rows.length, createRow])

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return
    setRows(prev => [...prev, createRow()])
    setResult(null)
  }

  const duplicateRow = (rowId: string) => {
    const row = rows.find(item => item.id === rowId)
    if (!row || rows.length >= MAX_ROWS) return
    setRows(prev => [...prev, { ...row, id: createRow().id }])
    setResult(null)
  }

  const removeRow = (rowId: string) => {
    setRows(prev => prev.filter(item => item.id !== rowId))
    setResult(null)
  }

  const updateRow = (rowId: string, updates: Partial<BulkShiftRow>) => {
    setRows(prev => prev.map(item => (item.id === rowId ? { ...item, ...updates } : item)))
    setResult(null)
  }

  const canSubmit = () => {
    if (!currentUser) return false
    if (!teamId || rows.length === 0 || rows.length > MAX_ROWS) return false
    return rows.every(row => {
      if (action === 'create' && (!row.userId || !row.date)) return false
      if (action !== 'create' && !row.shiftId) return false
      if (action === 'delete') return Boolean(row.shiftId)
      return Boolean(row.shiftTypeId && row.startTime && row.endTime)
    })
  }

  const handleSave = async () => {
    if (!canSubmit() || !currentUser) return

    const payload = {
      action,
      teamId,
      items: rows.map(row => ({
        shiftId: row.shiftId,
        userId: row.userId,
        date: row.date,
        shiftTypeId: row.shiftTypeId || undefined,
        startTime: row.startTime || undefined,
        endTime: row.endTime || undefined,
        comment: row.comment || undefined,
      })),
      currentUserId: currentUser.id,
    }

    bulkUpdateMutation.mutate(payload)
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Bulk vaktendring</DialogTitle>
          <DialogDescription>
            Opprett, oppdater eller slett vakter i en tabell med ulike datoer og tider.
          </DialogDescription>
        </DialogHeader>

          <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Handling</Label>
            <Select value={action} onValueChange={(value) => setAction(value as BulkAction)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create">Opprett</SelectItem>
                <SelectItem value="update">Oppdater</SelectItem>
                <SelectItem value="delete">Slett</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              {rows.length} rad(er) valgt
              {rows.length > MAX_ROWS && ` (maks ${MAX_ROWS})`}
            </div>
            <Button variant="outline" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
              Legg til rad
            </Button>
          </div>

          {rows.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Ingen rader lagt til ennå. Klikk “Legg til rad”.
            </div>
          )}

          <div className="grid gap-3">
            {rows.map(row => {
              const isCreate = action === 'create'
              const isUpdate = action === 'update'
              const isDelete = action === 'delete'
              const scheduledCount = row.date ? (shiftsPerDate.get(row.date) || 0) : null
              const capacity = teamUsers.length
              const available = capacity ? Math.max(0, capacity - (scheduledCount || 0)) : null

              const employeeShifts = row.userId
                ? teamShifts.filter(shift => shift.userId === row.userId)
                : []

              return (
                <div key={row.id} className="rounded-md border p-3">
                  {isCreate && (
                    <div className="grid gap-3">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
                        <EmployeeSelect
                          users={teamUsers}
                          value={row.userId}
                          onChange={(value) => updateRow(row.id, { userId: value })}
                          isLoading={usersLoading}
                          error={usersError}
                        />

                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label>Dato</Label>
                            <Input
                              type="date"
                              value={row.date}
                              onChange={(e) => updateRow(row.id, { date: e.target.value })}
                            />
                            {row.date && capacity > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Planlagt: {scheduledCount} / {capacity} · Ledig: {available}
                              </div>
                            )}
                          </div>

                          <div className="grid gap-2">
                            <Label>Vakt</Label>
                            <Select
                              value={row.shiftTypeId}
                              onValueChange={(value) => {
                                const selected = shiftTypeById.get(value)
                                updateRow(row.id, {
                                  shiftTypeId: value,
                                  startTime: selected?.defaultStartTime || row.startTime,
                                  endTime: selected?.defaultEndTime || row.endTime,
                                  useCustomTime: false,
                                })
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Velg vakt" />
                              </SelectTrigger>
                              <SelectContent>
                                {shiftTypes.map(st => (
                                  <SelectItem key={st.id} value={st.id}>
                                    {st.label} ({st.defaultStartTime}-{st.defaultEndTime})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={row.useCustomTime}
                                onChange={(e) => updateRow(row.id, { useCustomTime: e.target.checked })}
                              />
                              <Label>Tilpass tid</Label>
                            </div>
                            {row.useCustomTime && (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="grid gap-2">
                                  <Label>Start</Label>
                                  <Input
                                    type="time"
                                    value={row.startTime}
                                    onChange={(e) => updateRow(row.id, { startTime: e.target.value })}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label>Slutt</Label>
                                  <Input
                                    type="time"
                                    value={row.endTime}
                                    onChange={(e) => updateRow(row.id, { endTime: e.target.value })}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2 mt-1">
                        <Label>Kommentar (valgfritt)</Label>
                        <Input
                          value={row.comment}
                          onChange={(e) => updateRow(row.id, { comment: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {!isCreate && (
                    <div className="grid gap-3">
                      <EmployeeSelect
                        users={teamUsers}
                        value={row.userId}
                        onChange={(value) => {
                          updateRow(row.id, {
                            userId: value,
                            shiftId: undefined,
                            date: '',
                            shiftTypeId: defaultShiftType?.id || '',
                            startTime: defaultShiftType?.defaultStartTime || '',
                            endTime: defaultShiftType?.defaultEndTime || '',
                            comment: '',
                            useCustomTime: false,
                          })
                        }}
                        isLoading={usersLoading}
                        error={usersError}
                      />
                      {row.userId ? (
                        <EmployeeShiftPicker
                          shifts={employeeShifts}
                          selectedShiftId={row.shiftId}
                          onSelect={(value) => {
                            const shift = shiftsById.get(value)
                            if (!shift) return
                            updateRow(row.id, {
                              shiftId: value,
                              userId: shift.userId,
                              date: shift.date,
                              shiftTypeId: shift.shiftTypeId,
                              startTime: format(new Date(shift.startDateTime), 'HH:mm'),
                              endTime: format(new Date(shift.endDateTime), 'HH:mm'),
                              comment: shift.comment || '',
                              useCustomTime: false,
                            })
                          }}
                          isLoading={shiftsLoading}
                          error={shiftsError}
                        />
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Velg ansatt for å se vakter.
                        </div>
                      )}
                    </div>
                  )}

                  {isUpdate && row.shiftId && (
                    <div className="mt-3 grid gap-2">
                      <Label>Vakt</Label>
                      <Select
                        value={row.shiftTypeId}
                        onValueChange={(value) => {
                          const selected = shiftTypeById.get(value)
                          updateRow(row.id, {
                            shiftTypeId: value,
                            startTime: selected?.defaultStartTime || row.startTime,
                            endTime: selected?.defaultEndTime || row.endTime,
                            useCustomTime: false,
                          })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Velg vakt" />
                        </SelectTrigger>
                        <SelectContent>
                          {shiftTypes.map(st => (
                            <SelectItem key={st.id} value={st.id}>
                              {st.label} ({st.defaultStartTime}-{st.defaultEndTime})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {isUpdate && row.shiftId && (
                    <div className="mt-3 grid gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.useCustomTime}
                          onChange={(e) => updateRow(row.id, { useCustomTime: e.target.checked })}
                        />
                        <Label>Tilpass tid</Label>
                      </div>
                      {row.useCustomTime && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-2">
                            <Label>Start</Label>
                            <Input
                              type="time"
                              value={row.startTime}
                              onChange={(e) => updateRow(row.id, { startTime: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Slutt</Label>
                            <Input
                              type="time"
                              value={row.endTime}
                              onChange={(e) => updateRow(row.id, { endTime: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isUpdate && row.shiftId && (
                    <div className="mt-3 grid gap-2">
                      <Label>Kommentar (valgfritt)</Label>
                      <Input
                        value={row.comment}
                        onChange={(e) => updateRow(row.id, { comment: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <Button variant="ghost" onClick={() => duplicateRow(row.id)}>
                      Dupliser
                    </Button>
                    <Button variant="ghost" onClick={() => removeRow(row.id)}>
                      Fjern
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          {result && result.failures.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="font-medium">Noen rader feilet</div>
              <div className="mt-2 space-y-1">
                {result.failures.map((failure, index) => (
                  <div key={`${failure.userId}-${failure.date}-${index}`}>
                    {userNameById.get(failure.userId) || failure.userId} · {failure.date} · {failure.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit() || bulkUpdateMutation.isPending}>
            {bulkUpdateMutation.isPending ? 'Lagrer...' : 'Utfør'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

