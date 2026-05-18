"use client"

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { holidayTypeToNorwegian, statusToNorwegian } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { axiosInstance, apiErrorMessage } from '@/lib/axios'
import { useMe } from '@/lib/hooks/useMe'

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

/**
 * Admin > Ferie- og fraværsforespørsler.
 *
 * Reachable only when the parent `AdminLayout` has confirmed the caller is
 * an admin. The API enforces it independently via `withAuth` + role checks.
 */
export default function AdminHolidayRequestsPage() {
  const { data: me } = useMe()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const requestsQueryKey = ['holiday-requests', me?.teamId]
  const { data: items = [], isLoading: loading } = useQuery<RequestRow[]>({
    queryKey: requestsQueryKey,
    queryFn: async () => {
      if (!me?.teamId) return []
      const params = new URLSearchParams()
      params.set('teamId', me.teamId)
      const res = await axiosInstance.get(`/api/holiday-requests?${params.toString()}`)
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(me?.id),
  })

  const decisionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) => {
      return axiosInstance.patch(
        `/api/holiday-requests/${id}`,
        { action },
      )
    },
    onSuccess: async () => {
      toast({ title: 'Oppdatert' })
      await queryClient.invalidateQueries({ queryKey: requestsQueryKey })
    },
    onError: (error) => {
      toast({ title: 'Feil', description: apiErrorMessage(error, 'Kunne ikke oppdatere'), variant: 'destructive' })
    },
  })

  if (!me) return <div role="status" aria-live="polite" className="text-muted-foreground p-8">Laster…</div>

  const handleDecision = async (id: string, action: 'APPROVE' | 'REJECT') => {
    await decisionMutation.mutateAsync({ id, action })
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
        <div role="status" aria-live="polite">Laster…</div>
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
