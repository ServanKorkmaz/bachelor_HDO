"use client"

import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parse, getISODay, format, addDays } from 'date-fns'
import { axiosInstance } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { GenerateResult } from './GenerateResultDialog'

interface Pattern { id: string; name: string; weeks: number; slotsJson: string }

interface Props {
  pattern: Pattern
  onClose: () => void
  onResult: (result: GenerateResult) => void
}

export function GenerateShiftsDialog({ pattern, onClose, onResult }: Props) {
  const [startMonday, setStartMonday] = useState('')
  const [weeks, setWeeks] = useState(4)

  const startDate = useMemo(() => {
    if (!startMonday) return null
    try {
      const d = parse(startMonday, 'yyyy-MM-dd', new Date())
      return isNaN(d.getTime()) ? null : d
    } catch { return null }
  }, [startMonday])

  const isMonday = startDate ? getISODay(startDate) === 1 : false

  const estimatedShifts = useMemo(() => {
    try {
      const slots = JSON.parse(pattern.slotsJson) as Array<unknown>
      return Math.round((slots.length / pattern.weeks) * weeks)
    } catch { return 0 }
  }, [pattern, weeks])

  const endDate = startDate ? format(addDays(startDate, weeks * 7 - 1), 'yyyy-MM-dd') : ''

  const generateMutation = useMutation({
    mutationFn: async () =>
      axiosInstance.post(`/api/rotation-patterns/${pattern.id}/generate`, {
        startMonday, weeks,
      }),
    onSuccess: (res) => {
      onResult(res.data as GenerateResult)
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generer vakter fra «{pattern.name}»</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Start-mandag</Label>
            <Input
              type="date"
              value={startMonday}
              onChange={(e) => setStartMonday(e.target.value)}
            />
            {startMonday && !isMonday && (
              <p className="text-xs text-destructive">Datoen må være en mandag.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Antall uker fremover</Label>
            <Input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
            />
          </div>

          {isMonday && (
            <div className="rounded bg-muted/40 p-3 text-sm">
              <p>Genererer ca. <strong>{estimatedShifts}</strong> vakter fra {startMonday} til {endDate}.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Eksisterende vakter på samme datoer blir hoppet over og rapportert.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button
            disabled={!isMonday || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? 'Genererer…' : 'Generer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
