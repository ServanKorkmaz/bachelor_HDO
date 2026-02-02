"use client"

import { useEffect, useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
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
const SHIFT_LOOKBACK_DAYS = 30
const SHIFT_LOOKAHEAD_DAYS = 90

/** Modal for bulk create/update/delete of shifts across users and dates. */
export function BulkShiftModal({ teamId, onClose }: BulkShiftModalProps) {
  const { currentUser } = useAuth()
  const [action, setAction] = useState<BulkAction>('create')
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [rows, setRows] = useState<BulkShiftRow[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{
    successes: Array<{ userId: string; date: string; shiftId?: string }>
    failures: Array<{ userId: string; date: string; error: string }>
  } | null>(null)
  const [teamShifts, setTeamShifts] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/shift-types')
      .then(res => res.json())
      .then(data => {
        setShiftTypes(data)
      })
      .catch(console.error)

    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!teamId) return
    const today = new Date()
    const dateFrom = format(subDays(today, SHIFT_LOOKBACK_DAYS), 'yyyy-MM-dd')
    const dateTo = format(new Date(today.getTime() + SHIFT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')

    fetch(`/api/shifts?teamId=${teamId}&dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then(res => res.json())
      .then(data => setTeamShifts(data))
      .catch(console.error)
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
  const shiftsForDropdown = useMemo(
    () => teamShifts.map(shift => ({
      id: shift.id,
      userId: shift.userId,
      date: shift.date,
      shiftTypeId: shift.shiftTypeId,
      startTime: format(new Date(shift.startDateTime), 'HH:mm'),
      endTime: format(new Date(shift.endDateTime), 'HH:mm'),
      label: `${userNameById.get(shift.userId) || 'Ukjent'} · ${shift.date} · ${shift.shiftType?.label || 'Vakt'} (${format(new Date(shift.startDateTime), 'HH:mm')}-${format(new Date(shift.endDateTime), 'HH:mm')})`,
    })),
    [teamShifts, userNameById]
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

    setIsSaving(true)
    try {
      const response = await fetch('/api/shifts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

              return (
                <div key={row.id} className="rounded-md border p-3">
                  {isCreate && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Ansatt</Label>
                        <Select
                          value={row.userId}
                          onValueChange={(value) => updateRow(row.id, { userId: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Velg ansatt" />
                          </SelectTrigger>
                          <SelectContent>
                            {teamUsers.map(user => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
                    </div>
                  )}

                  {!isCreate && (
                    <div className="grid gap-2">
                      <Label>Oppsatt vakt</Label>
                      <Select
                        value={row.shiftId || ''}
                        onValueChange={(value) => {
                          const shift = shiftsById.get(value)
                          if (!shift) {
                            updateRow(row.id, { shiftId: value })
                            return
                          }
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
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Velg vakt" />
                        </SelectTrigger>
                        <SelectContent>
                          {shiftsForDropdown.map(shift => (
                            <SelectItem key={shift.id} value={shift.id}>
                              {shift.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(isCreate || isUpdate) && (
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

                  {(isCreate || isUpdate) && (
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

                  {(isCreate || isUpdate) && (
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
          <Button onClick={handleSave} disabled={!canSubmit() || isSaving}>
            {isSaving ? 'Lagrer...' : 'Utfør'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

