"use client"

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
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
import { MockUser } from '@/lib/auth/mockAuth'
import { useAuth } from '@/lib/auth/mockAuth'
import { formatTime, formatDateDisplay, formatDayName } from '@/lib/date-utils'

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

interface ShiftModalProps {
  shift: Shift | null
  date: string | null
  userId: string | null
  onClose: () => void
  currentUser: MockUser | null
}

/** Modal for viewing, creating, or updating a single shift. */
export function ShiftModal({ shift, date, userId, onClose, currentUser }: ShiftModalProps) {
  const { canEditShifts } = useAuth()
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>(userId || '')
  const [startTime, setStartTime] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('')
  const [comment, setComment] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetch('/api/shift-types')
      .then(res => res.json())
      .then(data => setShiftTypes(data))
      .catch(console.error)

    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (shift) {
      setSelectedShiftTypeId(shift.shiftType.id)
      setSelectedUserId(shift.userId)
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

  const handleSave = async () => {
    const effectiveDate = shift?.date ?? date
    if (!effectiveDate || !selectedShiftTypeId || !selectedUserId) return

    setIsSaving(true)
    try {
      const shiftData = {
        date: effectiveDate,
        userId: selectedUserId,
        shiftTypeId: selectedShiftTypeId,
        startTime,
        endTime,
        comment: comment || undefined,
      }

      const url = shift ? `/api/shifts/${shift.id}` : '/api/shifts'
      const method = shift ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shiftData),
      })

      if (response.ok) {
        onClose()
        window.location.reload() // Refresh to show updated data
      } else {
        alert('Kunne ikke lagre vakt')
      }
    } catch (error) {
      console.error('Error saving shift:', error)
      alert('Kunne ikke lagre vakt')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!shift) return

    if (!confirm('Er du sikker på at du vil slette denne vakten?')) return

    try {
      const response = await fetch(`/api/shifts/${shift.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        onClose()
        window.location.reload()
      } else {
        alert('Kunne ikke slette vakt')
      }
    } catch (error) {
      console.error('Error deleting shift:', error)
      alert('Kunne ikke slette vakt')
    }
  }

  const displayDate = shift ? shift.date : date
  const displayUser = shift
    ? shift.user.name
    : users.find(u => u.id === userId)?.name || ''

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Detaljer for dag {displayDate ? formatDateDisplay(displayDate) : ''}
          </DialogTitle>
          <DialogDescription>
            {displayDate && formatDayName(displayDate)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Tidspunkt</Label>
            {shift ? (
              <div className="p-3 bg-muted rounded-md">
                <div className="font-medium">{shift.shiftType.label}</div>
                <div className="text-sm text-muted-foreground">
                  {formatTime(shift.startDateTime)} - {formatTime(shift.endDateTime)}
                </div>
              </div>
            ) : canEditShifts() ? (
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
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Hvem</Label>
            <div className="p-3 bg-muted rounded-md">
              {displayUser}
            </div>
          </div>

          {canEditShifts() && (
            <div className="grid gap-2">
              <Label>Kommentar</Label>
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Legg til kommentar..."
              />
            </div>
          )}

          {shift && shift.comment && (
            <div className="grid gap-2">
              <Label>Kommentar</Label>
              <div className="p-3 bg-muted rounded-md text-sm">
                {shift.comment}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {canEditShifts() && (
            <>
              {shift && (
                <Button variant="destructive" onClick={handleDelete}>
                  Slett
                </Button>
              )}
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Lagrer...' : 'Lagre'}
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

