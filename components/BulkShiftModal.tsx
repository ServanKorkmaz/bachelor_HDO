"use client"

import { useEffect, useMemo, useState } from 'react'
import { eachDayOfInterval, format, parse } from 'date-fns'
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
type ShiftFilter = 'upcoming' | 'past' | 'all'

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Man' },
  { value: 2, label: 'Tir' },
  { value: 3, label: 'Ons' },
  { value: 4, label: 'Tor' },
  { value: 5, label: 'Fre' },
  { value: 6, label: 'Lør' },
  { value: 7, label: 'Søn' },
]

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
      />
      <div className="max-h-40 overflow-y-auto rounded-md border p-1">
        {isLoading && (
          <div className="px-3 py-2 text-sm text-muted-foreground">Laster ansatte...</div>
        )}
        {error && (
          <div className="px-3 py-2 text-sm text-destructive">Kunne ikke laste ansatte</div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground">Ingen treff</div>
        )}
        {!isLoading && !error && filtered.map(user => (
          <button
            type="button"
            key={user.id}
            onClick={() => onChange(user.id)}
            className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
              value === user.id ? 'bg-primary/15 font-medium' : 'hover:bg-accent'
            }`}
          >
            {user.name}
          </button>
        ))}
      </div>
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
      <div className="text-sm font-medium leading-tight">{formatShiftDate(shift.date)}</div>
      <div className="mt-1 text-xs leading-tight text-muted-foreground">
        <div>{shift.shiftType?.label || 'Vakt'}</div>
        <div>
          {format(new Date(shift.startDateTime), 'HH:mm')} - {format(new Date(shift.endDateTime), 'HH:mm')}
        </div>
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

      <div className="max-h-64 overflow-y-auto rounded-md border p-3">
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
  const [action, setAction] = useState<BulkAction>('create')
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [rows, setRows] = useState<BulkShiftRow[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{
    successes: Array<{ userId: string; date: string; shiftId?: string }>
    failures: Array<{ userId: string; date: string; error: string }>
  } | null>(null)
  const [teamShifts, setTeamShifts] = useState<any[]>([])
  const [shiftsLoading, setShiftsLoading] = useState(false)
  const [shiftsError, setShiftsError] = useState<string | null>(null)
  const [quickUserId, setQuickUserId] = useState('')
  const [quickDateFrom, setQuickDateFrom] = useState('')
  const [quickDateTo, setQuickDateTo] = useState('')
  const [quickWeekdays, setQuickWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [quickShiftTypeId, setQuickShiftTypeId] = useState('')
  const [quickUseCustomTime, setQuickUseCustomTime] = useState(false)
  const [quickStartTime, setQuickStartTime] = useState('')
  const [quickEndTime, setQuickEndTime] = useState('')
  const [quickComment, setQuickComment] = useState('')
  const [quickDeleteUserId, setQuickDeleteUserId] = useState('')
  const [quickDeleteDateFrom, setQuickDeleteDateFrom] = useState('')
  const [quickDeleteDateTo, setQuickDeleteDateTo] = useState('')
  const [quickDeleteSearch, setQuickDeleteSearch] = useState('')
  const [selectedDeleteShiftIds, setSelectedDeleteShiftIds] = useState<string[]>([])
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  useEffect(() => {
    setUsersLoading(true)
    setUsersError(null)
    fetch('/api/shift-types')
      .then(res => res.json())
      .then(data => {
        setShiftTypes(data)
      })
      .catch(console.error)

    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch((error) => {
        console.error(error)
        setUsersError('Kunne ikke laste ansatte')
      })
      .finally(() => {
        setUsersLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!teamId) return
    setShiftsLoading(true)
    setShiftsError(null)

    fetch(`/api/shifts?teamId=${teamId}`)
      .then(res => res.json())
      .then(data => setTeamShifts(data))
      .catch((error) => {
        console.error(error)
        setShiftsError('Kunne ikke laste vakter')
      })
      .finally(() => {
        setShiftsLoading(false)
      })
  }, [teamId])

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

  const createRow = (): BulkShiftRow => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    shiftId: undefined,
    userId: '',
    date: '',
    shiftTypeId: defaultShiftType?.id || '',
    startTime: defaultShiftType?.defaultStartTime || '',
    endTime: defaultShiftType?.defaultEndTime || '',
    comment: '',
    useCustomTime: false,
  })

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
    if (!defaultShiftType) return
    setQuickShiftTypeId(prev => prev || defaultShiftType.id)
    setQuickStartTime(prev => prev || defaultShiftType.defaultStartTime)
    setQuickEndTime(prev => prev || defaultShiftType.defaultEndTime)
  }, [defaultShiftType])

  useEffect(() => {
    if (shiftTypes.length > 0 && rows.length === 0) {
      setRows([createRow()])
    }
  }, [shiftTypes.length, rows.length])

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

  const toggleQuickWeekday = (dayValue: number) => {
    setQuickWeekdays(prev => {
      if (prev.includes(dayValue)) {
        return prev.filter(d => d !== dayValue)
      }
      return [...prev, dayValue].sort((a, b) => a - b)
    })
  }

  const addQuickRows = () => {
    if (!quickUserId || !quickDateFrom || !quickDateTo || !quickShiftTypeId) {
      alert('Velg ansatt, datointervall og vakt før du genererer rader.')
      return
    }
    if (quickWeekdays.length === 0) {
      alert('Velg minst en ukedag.')
      return
    }

    const fromDate = parseDate(quickDateFrom)
    const toDate = parseDate(quickDateTo)
    const start = fromDate <= toDate ? fromDate : toDate
    const end = fromDate <= toDate ? toDate : fromDate

    const dates = eachDayOfInterval({ start, end }).filter(date => {
      const isoDay = date.getDay() === 0 ? 7 : date.getDay()
      return quickWeekdays.includes(isoDay)
    })

    if (dates.length === 0) {
      alert('Ingen datoer matcher valgt intervall og ukedager.')
      return
    }

    const remaining = MAX_ROWS - rows.length
    if (remaining <= 0) {
      alert(`Maks ${MAX_ROWS} rader er nådd.`)
      return
    }

    const rowsToAdd = dates.slice(0, remaining).map(date => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      shiftId: undefined,
      userId: quickUserId,
      date: format(date, 'yyyy-MM-dd'),
      shiftTypeId: quickShiftTypeId,
      startTime: quickStartTime,
      endTime: quickEndTime,
      comment: quickComment,
      useCustomTime: quickUseCustomTime,
    }))

    setRows(prev => [...prev, ...rowsToAdd])
    setResult(null)

    if (rowsToAdd.length < dates.length) {
      alert(`La til ${rowsToAdd.length} rader. Resten ble hoppet over pga maksgrense (${MAX_ROWS}).`)
    }
  }

  const deleteCandidateShifts = useMemo(() => {
    if (!quickDeleteUserId) return [] as any[]

    const normalizedQuery = quickDeleteSearch.trim().toLowerCase()
    const from = quickDeleteDateFrom || null
    const to = quickDeleteDateTo || null

    return teamShifts
      .filter(shift => shift.userId === quickDeleteUserId)
      .filter(shift => {
        if (from && shift.date < from) return false
        if (to && shift.date > to) return false
        return true
      })
      .filter(shift => {
        if (!normalizedQuery) return true
        const label = shift.shiftType?.label?.toLowerCase() || ''
        const comment = (shift.comment || '').toLowerCase()
        return shift.date.includes(normalizedQuery) || label.includes(normalizedQuery) || comment.includes(normalizedQuery)
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [quickDeleteUserId, quickDeleteSearch, quickDeleteDateFrom, quickDeleteDateTo, teamShifts])

  useEffect(() => {
    setSelectedDeleteShiftIds([])
  }, [quickDeleteUserId])

  const toggleDeleteShiftSelection = (shiftId: string, checked: boolean) => {
    setSelectedDeleteShiftIds(prev => {
      if (checked) {
        if (prev.includes(shiftId)) return prev
        return [...prev, shiftId]
      }
      return prev.filter(id => id !== shiftId)
    })
    setResult(null)
  }

  const canSubmit = () => {
    if (!currentUser) return false
    if (!teamId) return false

    if (action === 'delete') {
      return selectedDeleteShiftIds.length > 0
    }

    if (rows.length === 0 || rows.length > MAX_ROWS) return false
    return rows.every(row => {
      if (action === 'create' && (!row.userId || !row.date)) return false
      if (action !== 'create' && !row.shiftId) return false
      return Boolean(row.shiftTypeId && row.startTime && row.endTime)
    })
  }

  const handleSave = async () => {
    if (!canSubmit() || !currentUser) return

    if (action === 'delete' && selectedDeleteShiftIds.length > 1) {
      setIsDeleteConfirmOpen(true)
      return
    }

    await executeSave()
  }

  const executeSave = async () => {
    if (!canSubmit() || !currentUser) return

    setIsSaving(true)
    try {
      const response = await fetch('/api/shifts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          teamId,
          items: action === 'delete'
            ? selectedDeleteShiftIds.map(shiftId => {
                const shift = shiftsById.get(shiftId)
                return {
                  shiftId,
                  userId: shift?.userId || '',
                  date: shift?.date || '',
                }
              })
            : rows.map(row => ({
                shiftId: row.shiftId,
                userId: row.userId,
                date: row.date,
                shiftTypeId: row.shiftTypeId || undefined,
                startTime: row.startTime || undefined,
                endTime: row.endTime || undefined,
                comment: row.comment || undefined,
              })),
          currentUserId: currentUser.id,
        }),
      })

      const data = await response.json()
      if (response.ok) {
        const failures = data.failures?.length || 0
        const successes = data.successes?.length || 0
        if (failures > 0) {
          setResult({ successes: data.successes || [], failures: data.failures || [] })
          alert(`Fullført med ${successes} suksess(er) og ${failures} feil.`)
          return
        }
        setResult({ successes: data.successes || [], failures: [] })
        onClose()
        window.location.reload()
      } else {
        alert(data?.error || 'Kunne ikke oppdatere vakter')
      }
    } catch (error) {
      console.error('Error bulk updating shifts:', error)
      alert('Kunne ikke oppdatere vakter')
    } finally {
      setIsSaving(false)
    }
  }

  const deletePreviewDates = useMemo(() => {
    if (action !== 'delete') return []
    return [...new Set(selectedDeleteShiftIds.map(id => shiftsById.get(id)?.date).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b))
  }, [action, selectedDeleteShiftIds, shiftsById])

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              {action === 'delete' ? `${selectedDeleteShiftIds.length} vakt(er) markert for sletting` : `${rows.length} rad(er) valgt`}
              {action !== 'delete' && rows.length > MAX_ROWS && ` (maks ${MAX_ROWS})`}
            </div>
            {action !== 'delete' && (
              <Button variant="outline" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
                Legg til rad
              </Button>
            )}
          </div>

          {action === 'create' && (
            <div className="rounded-md border p-3">
              <div className="mb-3 text-sm font-medium">Hurtigopprett for flere datoer</div>

              <div className="grid gap-3 md:grid-cols-2">
                <EmployeeSelect
                  users={teamUsers}
                  value={quickUserId}
                  onChange={setQuickUserId}
                  isLoading={usersLoading}
                  error={usersError}
                />

                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label>Vakt</Label>
                    <Select
                      value={quickShiftTypeId}
                      onValueChange={(value) => {
                        const selected = shiftTypeById.get(value)
                        setQuickShiftTypeId(value)
                        if (!quickUseCustomTime) {
                          setQuickStartTime(selected?.defaultStartTime || quickStartTime)
                          setQuickEndTime(selected?.defaultEndTime || quickEndTime)
                        }
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
                    {quickShiftTypeId && (
                      <div className="text-xs text-muted-foreground">
                        Valgt tid: {quickStartTime || '--:--'} - {quickEndTime || '--:--'}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Fra dato</Label>
                      <Input type="date" value={quickDateFrom} onChange={(e) => setQuickDateFrom(e.target.value)} />
                    </div>

                    <div className="grid gap-2">
                      <Label>Til dato</Label>
                      <Input type="date" value={quickDateTo} onChange={(e) => setQuickDateTo(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                <Label>Ukedager</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map(option => (
                    <label key={option.value} className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={quickWeekdays.includes(option.value)}
                        onChange={() => toggleQuickWeekday(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={quickUseCustomTime}
                    onChange={(e) => setQuickUseCustomTime(e.target.checked)}
                  />
                  Tilpass tid
                </label>

                {quickUseCustomTime && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-2">
                      <Label>Start</Label>
                      <Input type="time" value={quickStartTime} onChange={(e) => setQuickStartTime(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Slutt</Label>
                      <Input type="time" value={quickEndTime} onChange={(e) => setQuickEndTime(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 grid gap-2">
                <Label>Kommentar (valgfritt)</Label>
                <Input value={quickComment} onChange={(e) => setQuickComment(e.target.value)} />
              </div>

              <div className="mt-3 flex justify-end">
                <Button type="button" variant="outline" onClick={addQuickRows}>
                  Generer rader
                </Button>
              </div>
            </div>
          )}

          {action === 'delete' && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
              <div className="mb-4 text-sm font-semibold text-destructive">Velg vakter som skal slettes</div>

              <div className="space-y-4">
                <EmployeeSelect
                  users={teamUsers}
                  value={quickDeleteUserId}
                  onChange={setQuickDeleteUserId}
                  isLoading={usersLoading}
                  error={usersError}
                />

                <div className="space-y-2">
                  <Label>Datoer</Label>
                  <div className="space-y-2">
                    <div className="grid gap-1">
                      <span className="text-xs text-muted-foreground">Fra dato</span>
                      <Input
                        type="date"
                        value={quickDeleteDateFrom}
                        onChange={(e) => setQuickDeleteDateFrom(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs text-muted-foreground">Til dato</span>
                      <Input
                        type="date"
                        value={quickDeleteDateTo}
                        onChange={(e) => setQuickDeleteDateTo(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs">Søk i vakter (dato, vakttype eller kommentar)</Label>
                  <Input
                    value={quickDeleteSearch}
                    onChange={(e) => setQuickDeleteSearch(e.target.value)}
                    placeholder="Søk..."
                  />
                </div>

                {quickDeleteUserId && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedDeleteShiftIds(deleteCandidateShifts.map(shift => shift.id))}
                      >
                        Marker alle viste
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedDeleteShiftIds([])}
                      >
                        Fjern markering
                      </Button>
                    </div>

                    <div className="max-h-72 overflow-y-auto rounded-md border bg-background p-2">
                      {deleteCandidateShifts.length === 0 && (
                        <div className="px-2 py-1 text-sm text-muted-foreground">
                          Ingen vakter funnet for valgt filter.
                        </div>
                      )}

                      {deleteCandidateShifts.map((shift) => {
                        const checked = selectedDeleteShiftIds.includes(shift.id)
                        return (
                          <label
                            key={shift.id}
                            className={`mb-1 flex cursor-pointer items-start gap-2 rounded border p-2 transition-colors ${
                              checked ? 'border-destructive/60 bg-destructive/10' : 'hover:bg-accent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={(e) => toggleDeleteShiftSelection(shift.id, e.target.checked)}
                            />
                            <div className="text-sm">
                              <div className="font-medium leading-tight">{shift.date}</div>
                              <div className="mt-1 text-xs leading-tight text-muted-foreground">
                                <div>{shift.shiftType?.label || 'Vakt'}</div>
                                <div>
                                  {format(new Date(shift.startDateTime), 'HH:mm')} - {format(new Date(shift.endDateTime), 'HH:mm')}
                                </div>
                                {shift.comment && <div>{shift.comment}</div>}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {action !== 'delete' && rows.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Ingen rader lagt til ennå. Klikk “Legg til rad”.
            </div>
          )}

          {action !== 'delete' && <div className="grid gap-3">
            {rows.map(row => {
              const isCreate = action === 'create'
              const isUpdate = action === 'update'
              const scheduledCount = row.date ? (shiftsPerDate.get(row.date) || 0) : null
              const capacity = teamUsers.length
              const available = capacity ? Math.max(0, capacity - (scheduledCount || 0)) : null

              const employeeShifts = row.userId
                ? teamShifts.filter(shift => shift.userId === row.userId)
                : []

              return (
                <div key={row.id} className="rounded-md border p-3">
                  {isCreate && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <EmployeeSelect
                        users={teamUsers}
                        value={row.userId}
                        onChange={(value) => updateRow(row.id, { userId: value })}
                        isLoading={usersLoading}
                        error={usersError}
                      />
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

                        <div className="mt-2 grid gap-2">
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
                          {row.shiftTypeId && (
                            <div className="text-xs text-muted-foreground">
                              Valgt tid: {row.startTime || '--:--'} - {row.endTime || '--:--'}
                            </div>
                          )}
                        </div>
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

                  {(isUpdate && row.shiftId) && (
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

                  {(isCreate || (isUpdate && row.shiftId)) && (
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

                  {(isCreate || (isUpdate && row.shiftId)) && (
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
          </div>}

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
          <Button onClick={handleSave} disabled={!canSubmit() || isSaving}>
            {isSaving ? 'Lagrer...' : 'Utfør'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bekreft sletting av flere vakter</DialogTitle>
            <DialogDescription>
              Du er i ferd med å slette {rows.length} vakter. Bekreft datoene under.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-48 overflow-y-auto rounded-md border p-2 text-sm">
            {deletePreviewDates.map(date => (
              <div key={date} className="py-0.5">
                {date}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(false)}
              disabled={isSaving}
            >
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setIsDeleteConfirmOpen(false)
                await executeSave()
              }}
              disabled={isSaving}
            >
              Bekreft sletting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

