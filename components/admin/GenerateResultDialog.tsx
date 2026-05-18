"use client"

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export interface GenerateResult {
  successes: Array<{ userId: string; date: string; shiftId: string }>
  failures:  Array<{ userId: string; date: string; error: string }>
}

interface Props {
  result: GenerateResult
  onClose: () => void
}

export function GenerateResultDialog({ result, onClose }: Props) {
  const total = result.successes.length + result.failures.length

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ✓ Genererte {result.successes.length} av {total} vakter
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {result.successes.length === total
              ? 'Alle vakter ble opprettet uten konflikter.'
              : `${result.failures.length} vakter ble hoppet over:`}
          </p>

          {result.failures.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-auto rounded bg-muted/40 p-3 text-xs">
              {result.failures.map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.userId}</span>{' '}
                  <span className="text-muted-foreground">{f.date}:</span> {f.error}
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
