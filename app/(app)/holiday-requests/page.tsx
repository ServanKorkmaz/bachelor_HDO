"use client"

import { useEffect, useState, useCallback } from 'react'
import { holidayTypeToNorwegian, statusToNorwegian } from '@/lib/i18n'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/mockAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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

export default function HolidayRequestsPage() {
  const { currentUser, isAdmin } = useAuth()
  const { toast } = useToast()
  const [items, setItems] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)

  // Edit dialog state
  const [editItem, setEditItem] = useState<RequestRow | null>(null)
  const [editType, setEditType] = useState('')
  const [editDateFrom, setEditDateFrom] = useState('')
  const [editDateTo, setEditDateTo] = useState('')
  const [editMessage, setEditMessage] = useState('')

  const fetchItems = useCallback(() => {
    if (!currentUser?.teamId) return
    setLoading(true)
    const params = new URLSearchParams()
    params.set('teamId', currentUser.teamId)
    fetch(`/api/holiday-requests?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: 'Feil', description: 'Kunne ikke hente forespørsler', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [currentUser?.teamId, toast])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  if (!currentUser) return <div>Vennligst logg inn</div>

  // Admin view: show all team requests with approve/reject
  if (isAdmin()) {
    const handleDecision = async (id: string, action: 'APPROVE' | 'REJECT') => {
      try {
        const res = await fetch(`/api/holiday-requests/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-current-user-id': currentUser.id },
          body: JSON.stringify({ action }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          toast({ title: 'Oppdatert' })
          fetchItems()
        } else {
          toast({ title: 'Feil', description: data.error || 'Kunne ikke oppdatere', variant: 'destructive' })
        }
      } catch (e) {
        toast({ title: 'Feil', description: 'Nettverksfeil', variant: 'destructive' })
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
                    <td className="p-3">{holidayTypeToNorwegian(r.type)}</td>
                    <td className="p-3">{r.dateFrom}{r.dateTo ? ` — ${r.dateTo}` : ''}</td>
                    <td className="p-3">{r.message || '—'}</td>
                    <td className="p-3">{statusToNorwegian(r.status)}</td>
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

  // Employee view handlers
  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette denne forespørselen?')) return
    try {
      const res = await fetch(`/api/holiday-requests/${id}?currentUserId=${currentUser.id}`, { method: 'DELETE' })
      if (res.ok) { toast({ title: 'Slettet' }); fetchItems() }
      else { const d = await res.json().catch(() => ({})); toast({ title: 'Feil', description: d.error || 'Kunne ikke slette', variant: 'destructive' }) }
    } catch { toast({ title: 'Feil', description: 'Nettverksfeil', variant: 'destructive' }) }
  }

  const openEdit = (r: RequestRow) => {
    setEditItem(r)
    setEditType(r.type)
    setEditDateFrom(r.dateFrom)
    setEditDateTo(r.dateTo ?? '')
    setEditMessage(r.message ?? '')
  }

  const handleEdit = async () => {
    if (!editItem || !currentUser) return
    try {
      const res = await fetch(`/api/holiday-requests/${editItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': currentUser.id },
        body: JSON.stringify({ type: editType, dateFrom: editDateFrom, dateTo: editDateTo || null, message: editMessage || null }),
      })
      if (res.ok) { toast({ title: 'Oppdatert' }); setEditItem(null); fetchItems() }
      else { const d = await res.json().catch(() => ({})); toast({ title: 'Feil', description: d.error || 'Kunne ikke oppdatere', variant: 'destructive' }) }
    } catch { toast({ title: 'Feil', description: 'Nettverksfeil', variant: 'destructive' }) }
  }

  // Employee view: button to create request + list of own requests
  const own = items.filter((it) => it.user?.id === currentUser.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fravær</h1>
          <p className="text-sm text-muted-foreground">Be om fravær eller ferie og se egne forespørsler.</p>
        </div>
        <div>
          <Button asChild>
            <Link href="/holiday-requests/new">Be om fravær</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div>Laster…</div>
      ) : own.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">Du har ingen forespørsler.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="border-b border-border p-3 text-left text-sm font-medium">Type</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Datoer</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Melding</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Status</th>
                <th className="border-b border-border p-3 text-right text-sm font-medium">Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {own.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="p-3">{holidayTypeToNorwegian(r.type)}</td>
                  <td className="p-3">{r.dateFrom}{r.dateTo ? ` — ${r.dateTo}` : ''}</td>
                  <td className="p-3">{r.message || '—'}</td>
                  <td className="p-3">{statusToNorwegian(r.status)}</td>
                  <td className="p-3 text-right">
                    {r.status === 'PENDING' && (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(r)}>Endre</Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(r.id)}>Slett</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg space-y-4">
            <h2 className="text-xl font-semibold">Endre forespørsel</h2>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOLIDAY">Ferie</SelectItem>
                  <SelectItem value="OTHER">Fravær</SelectItem>
                  <SelectItem value="SICK">Sykdom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fra dato</Label>
              <Input
                type="date"
                value={editDateFrom}
                onChange={(e) => setEditDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Til dato (valgfritt)</Label>
              <Input
                type="date"
                value={editDateTo}
                onChange={(e) => setEditDateTo(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Melding (valgfritt)</Label>
              <Textarea
                value={editMessage}
                onChange={(e) => setEditMessage(e.target.value)}
                rows={3}
                placeholder="Skriv melding..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditItem(null)}>Avbryt</Button>
              <Button onClick={handleEdit} disabled={!editType || !editDateFrom}>Lagre</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
