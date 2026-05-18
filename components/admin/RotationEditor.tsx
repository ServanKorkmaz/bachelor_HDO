"use client"

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { axiosInstance } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface UserOption { id: string; name: string }
interface ShiftTypeOption {
  id: string
  code: string
  label: string
  defaultStartTime: string
  defaultEndTime: string
}
interface TeamOption { id: string; name: string }

export interface RotationSlot {
  userId: string
  weekIndex: number
  dayOfWeek: number
  shiftTypeId: string
}

export interface RotationFormValue {
  teamId: string
  name: string
  weeks: number
  slots: RotationSlot[]
}

interface Props {
  /** Initial team selection. On edit, this becomes locked. */
  teamId: string
  initial?: RotationFormValue | null
  /** When true (edit mode), team cannot be changed because slots reference users from that team. */
  lockTeam?: boolean
  onSubmit: (value: RotationFormValue) => void
  submitting?: boolean
}

const WEEKDAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']

export function RotationEditor({ teamId: initialTeamId, initial, lockTeam, onSubmit, submitting }: Props) {
  const [teamId, setTeamId] = useState(initialTeamId)
  const [name, setName] = useState(initial?.name ?? '')
  const [weeks, setWeeks] = useState(initial?.weeks ?? 1)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    initial ? Array.from(new Set(initial.slots.map((s) => s.userId))) : []
  )
  // Map<userId|weekIndex|dayOfWeek, shiftTypeId>
  const [slotMap, setSlotMap] = useState<Map<string, string>>(
    new Map(initial?.slots.map((s) => [`${s.userId}|${s.weekIndex}|${s.dayOfWeek}`, s.shiftTypeId]) ?? [])
  )

  const { data: teams = [] } = useQuery<TeamOption[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/teams')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['team-users', teamId],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/users?teamId=${teamId}`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(teamId),
  })

  const { data: allShiftTypes = [] } = useQuery<ShiftTypeOption[]>({
    queryKey: ['shift-types'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/shift-types')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  // Shift types with start==end==00:00 (e.g. "Fri") expand to 24-hour shifts in
  // the DB. In a rotation context, putting one on every off-day would clash
  // back-to-back and the AML hvile-check would reject most of them. The "—"
  // option already covers "no work this day", so off-style types are filtered
  // out of the dropdown here.
  const shiftTypes = useMemo(
    () => allShiftTypes.filter(
      (st) => !(st.defaultStartTime === '00:00' && st.defaultEndTime === '00:00')
    ),
    [allShiftTypes]
  )

  const slots: RotationSlot[] = useMemo(() => {
    const out: RotationSlot[] = []
    for (const [key, shiftTypeId] of slotMap.entries()) {
      const [userId, w, d] = key.split('|')
      out.push({
        userId,
        weekIndex: Number(w),
        dayOfWeek: Number(d),
        shiftTypeId,
      })
    }
    return out
  }, [slotMap])

  function setCell(userId: string, weekIndex: number, dayOfWeek: number, shiftTypeId: string) {
    const key = `${userId}|${weekIndex}|${dayOfWeek}`
    setSlotMap((prev) => {
      const next = new Map(prev)
      if (shiftTypeId === '__none__') next.delete(key)
      else next.set(key, shiftTypeId)
      return next
    })
  }

  function changeTeam(nextTeamId: string) {
    if (nextTeamId === teamId) return
    // Slots reference user ids from the previous team; reset to avoid silent
    // "user not in team" rejections at save time.
    setTeamId(nextTeamId)
    setSelectedUserIds([])
    setSlotMap(new Map())
  }

  function addUser(userId: string) {
    if (selectedUserIds.includes(userId)) return
    setSelectedUserIds([...selectedUserIds, userId])
  }

  function removeUser(userId: string) {
    setSelectedUserIds(selectedUserIds.filter((id) => id !== userId))
    setSlotMap((prev) => {
      const next = new Map(prev)
      for (const key of next.keys()) {
        if (key.startsWith(`${userId}|`)) next.delete(key)
      }
      return next
    })
  }

  function handleSubmit() {
    onSubmit({ teamId, name: name.trim(), weeks, slots })
  }

  const availableUsersToAdd = users.filter((u) => !selectedUserIds.includes(u.id))

  return (
    <div className="space-y-6">
      <div className="space-y-2 max-w-md">
        <Label>Team</Label>
        <Select value={teamId} onValueChange={changeTeam} disabled={lockTeam}>
          <SelectTrigger><SelectValue placeholder="Velg team" /></SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {lockTeam && (
          <p className="text-xs text-muted-foreground">Team kan ikke endres etter at planen er opprettet.</p>
        )}
      </div>

      <div className="space-y-2 max-w-md">
        <Label>Navn</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Helse 3-ukers rotasjon" />
      </div>

      <div className="space-y-2 max-w-md">
        <Label>Cycle uker</Label>
        <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} {n === 1 ? 'uke' : 'uker'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Planen gjentas hver {weeks}. uke. Startdato velges når du genererer vakter fra planen.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Ansatte i planen</Label>
        <div className="flex flex-wrap gap-2">
          {selectedUserIds.map((id) => {
            const u = users.find((x) => x.id === id)
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs">
                {u?.name ?? id}
                <button onClick={() => removeUser(id)} className="text-muted-foreground hover:text-foreground">&#x2715;</button>
              </span>
            )
          })}
          {availableUsersToAdd.length > 0 ? (
            <Select value="" onValueChange={addUser}>
              <SelectTrigger className="w-48"><SelectValue placeholder="+ Legg til ansatt" /></SelectTrigger>
              <SelectContent>
                {availableUsersToAdd.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : selectedUserIds.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ingen aktive medlemmer i det valgte teamet. Legg til ansatte via Brukere-siden først.
            </p>
          )}
        </div>
      </div>

      {selectedUserIds.length > 0 && (
        <div className="space-y-6">
          {selectedUserIds.map((userId) => {
            const u = users.find((x) => x.id === userId)
            return (
              <div key={userId} className="space-y-2 rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold">{u?.name ?? userId}</h3>
                <table className="w-full border-separate border-spacing-1 text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="p-1 text-left">Uke</th>
                      {WEEKDAY_LABELS.map((d) => <th key={d} className="p-1">{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: weeks }, (_, w) => (
                      <tr key={w}>
                        <td className="p-1 text-xs text-muted-foreground">Uke {w + 1}</td>
                        {WEEKDAY_LABELS.map((_, d) => {
                          const dayOfWeek = d + 1
                          const key = `${userId}|${w}|${dayOfWeek}`
                          const value = slotMap.get(key) ?? '__none__'
                          return (
                            <td key={d} className="p-1">
                              <Select value={value} onValueChange={(v) => setCell(userId, w, dayOfWeek, v)}>
                                <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">&#x2014;</SelectItem>
                                  {shiftTypes.map((st) => (
                                    <SelectItem key={st.id} value={st.id}>{st.label || st.code}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={handleSubmit} disabled={submitting || !teamId || !name.trim() || selectedUserIds.length === 0}>
          {submitting ? 'Lagrer…' : 'Lagre plan'}
        </Button>
      </div>
    </div>
  )
}
