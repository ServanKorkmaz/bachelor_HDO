"use client"

import Link from 'next/link'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { axiosInstance } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export interface GenerateResult {
  successes: Array<{ userId: string; date: string; shiftId: string }>
  failures:  Array<{ userId: string; date: string; error: string }>
}

interface Props {
  /** Team the generated pattern belongs to; used to resolve userId → name. */
  teamId: string
  result: GenerateResult
  onClose: () => void
}

interface UserOption { id: string; name: string }

function formatDateNo(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function GenerateResultDialog({ teamId, result, onClose }: Props) {
  const total = result.successes.length + result.failures.length

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['team-users', teamId],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/users?teamId=${teamId}`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(teamId),
  })

  const nameById = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users]
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
            Genererte {result.successes.length} av {total} vakter
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {result.successes.length === total
              ? 'Alle vakter ble opprettet uten konflikter.'
              : `${result.failures.length} vakter ble hoppet over:`}
          </p>

          {result.failures.length > 0 && (
            <ul className="max-h-64 space-y-2 overflow-auto rounded bg-muted/40 p-3 text-sm">
              {result.failures.map((f, i) => (
                <li key={i} className="leading-snug">
                  <div>
                    <span className="font-medium">{nameById.get(f.userId) ?? f.userId}</span>
                    <span className="text-muted-foreground"> · {formatDateNo(f.date)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{f.error}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Lukk</Button>
          <Link href="/standard">
            <Button onClick={onClose}>Gå til turnusoversikt</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
