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
interface ShiftTypeOption { id: string; code: string; label: string }

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
  teamId: string
  initial?: RotationFormValue | null
  onSubmit: (value: RotationFormValue) => void
  submitting?: boolean
}

const WEEKDAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']

export function RotationEditor({ teamId, initial, onSubmit, submitting }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [weeks, setWeeks] = useState(initial?.weeks ?? 1)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    initial ? Array.from(new Set(initial.slots.map((s) => s.userId))) : []
  )
  const [activeUserId, setActiveUserId] = useState<string | null>(
    initial?.slots[0]?.userId ?? null
  )
  // Map<userId|weekIndex|dayOfWeek, shiftTypeId>
  const [slotMap, setSlotMap] = useState<Map<string, string>>(
    new Map(initial?.slots.map((s) => [`${s.userId}|${s.weekIndex}|${s.dayOfWeek}`, s.shiftTypeId]) ?? [])
  )

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['team-users', teamId],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/users?teamId=${teamId}`)
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const { data: shiftTypes = [] } = useQuery<ShiftTypeOption[]>({
    queryKey: ['shift-types'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/shift-types')
      return Array.isArray(res.data) ? res.data : []
    },
  })

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

  function addUser(userId: string) {
    if (selectedUserIds.includes(userId)) return
    setSelectedUserIds([...selectedUserIds, userId])
    if (!activeUserId) setActiveUserId(userId)
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
    if (activeUserId === userId) setActiveUserId(selectedUserIds.find((id) => id !== userId) ?? null)
  }

  function handleSubmit() {
    onSubmit({ teamId, name: name.trim(), weeks, slots })
  }

  const activeUser = users.find((u) => u.id === activeUserId)
  const availableUsersToAdd = users.filter((u) => !selectedUserIds.includes(u.id))

  return (
    <div className="space-y-6">
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
        <p className="text-xs text-muted-foreground">Mønsteret gjentas hver {weeks}. uke ved generering.</p>
      </div>

      <div className="space-y-2">
        <Label>Ansatte i mønsteret</Label>
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
          {availableUsersToAdd.length > 0 && (
            <Select value="" onValueChange={addUser}>
              <SelectTrigger className="w-48"><SelectValue placeholder="+ Legg til ansatt" /></SelectTrigger>
              <SelectContent>
                {availableUsersToAdd.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {selectedUserIds.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {selectedUserIds.map((id) => {
              const u = users.find((x) => x.id === id)
              return (
                <Button
                  key={id}
                  variant={activeUserId === id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveUserId(id)}
                >
                  {u?.name ?? id}
                </Button>
              )
            })}
          </div>

          {activeUser && (
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
                      const key = `${activeUser.id}|${w}|${dayOfWeek}`
                      const value = slotMap.get(key) ?? '__none__'
                      return (
                        <td key={d} className="p-1">
                          <Select value={value} onValueChange={(v) => setCell(activeUser.id, w, dayOfWeek, v)}>
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
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={handleSubmit} disabled={submitting || !name.trim() || selectedUserIds.length === 0}>
          {submitting ? 'Lagrer…' : 'Lagre mønster'}
        </Button>
      </div>
    </div>
  )
}
