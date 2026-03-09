"use client"

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/mockAuth'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

type RequestRow = {
  id: string
  type: string
  status: string
  dateFrom: string
  dateTo?: string | null
  message?: string | null
  user: { id: string; name: string }
  createdAt: string
}

const ADMIN_HEADERS = (currentUserId: string) => ({
  'Content-Type': 'application/json',
  'x-current-user-id': currentUserId,
})

export default function AdminHolidayRequestsPage() {
  const { currentUser, isAdmin } = useAuth()
  const { toast } = useToast()
  const [items, setItems] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(() => {
    if (!currentUser?.id) return
    setLoading(true)
    const params = new URLSearchParams()
    params.set('teamId', currentUser.teamId)
    fetch(`/api/holiday-requests?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: 'Error', description: 'Failed to load requests', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [currentUser?.id, currentUser?.teamId, toast])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  if (!currentUser) return <div>Vennligst logg inn</div>
  if (!isAdmin() && !currentUser) return <div>Ingen tilgang</div>

  const handleDecision = async (id: string, action: 'APPROVE' | 'REJECT') => {
    try {
      const res = await fetch(`/api/holiday-requests/${id}`, {
        method: 'PATCH',
        headers: ADMIN_HEADERS(currentUser.id),
        body: JSON.stringify({ action, decidedByUserId: currentUser.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast({ title: 'Updated' })
        fetchItems()
      } else {
        toast({ title: 'Error', description: data.error || 'Could not update', variant: 'destructive' })
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ferie- og fraværsforespørsler</h1>
          <p className="text-sm text-muted-foreground">Gå gjennom og godkjenn eller avvis forespørsler fra brukere.</p>
        </div>
      </div>

      {loading ? (
        <div>Laster…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">Ingen forespørsler funnet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="border-b border-border p-3 text-left text-sm font-medium">Bruker</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Type</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Datoer</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Melding</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Status</th>
                <th className="border-b border-border p-3 text-right text-sm font-medium">Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="p-3">{r.user.name}</td>
                  <td className="p-3">{r.type}</td>
                  <td className="p-3">{r.dateFrom}{r.dateTo ? ` — ${r.dateTo}` : ''}</td>
                  <td className="p-3">{r.message || '—'}</td>
                  <td className="p-3">{r.status}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      {r.status === 'PENDING' && (
                        <>
                          <Button onClick={() => handleDecision(r.id, 'APPROVE')}>Godkjenn</Button>
                          <Button variant="destructive" onClick={() => handleDecision(r.id, 'REJECT')}>Avvis</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
