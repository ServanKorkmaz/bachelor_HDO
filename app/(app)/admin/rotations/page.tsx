"use client"

import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { axiosInstance } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { GenerateShiftsDialog } from '@/components/admin/GenerateShiftsDialog'
import { GenerateResultDialog, type GenerateResult } from '@/components/admin/GenerateResultDialog'

interface RotationPattern {
  id: string
  teamId: string
  name: string
  weeks: number
  slotsJson: string
}

interface PatternWithTeam extends RotationPattern {
  teamName: string
}

interface Team { id: string; name: string }

export default function RotationsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [generatingFor, setGeneratingFor] = useState<PatternWithTeam | null>(null)
  const [result, setResult] = useState<GenerateResult | null>(null)

  const { data: patterns = [], isLoading } = useQuery<PatternWithTeam[]>({
    queryKey: ['rotation-patterns', 'all'],
    queryFn: async () => {
      const teamsRes = await axiosInstance.get('/api/teams')
      const teams: Team[] = Array.isArray(teamsRes.data) ? teamsRes.data : []
      const perTeam = await Promise.all(
        teams.map(async (t) => {
          const res = await axiosInstance.get(`/api/rotation-patterns?teamId=${t.id}`)
          const list: RotationPattern[] = Array.isArray(res.data) ? res.data : []
          return list.map((p) => ({ ...p, teamName: t.name }))
        })
      )
      return perTeam.flat()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => axiosInstance.delete(`/api/rotation-patterns/${id}`),
    onSuccess: () => {
      toast({ title: 'Plan slettet' })
      queryClient.invalidateQueries({ queryKey: ['rotation-patterns', 'all'] })
    },
    onError: () => toast({ title: 'Feil', description: 'Kunne ikke slette', variant: 'destructive' }),
  })

  function uniqueUsers(slotsJson: string): number {
    try {
      const slots = JSON.parse(slotsJson) as Array<{ userId: string }>
      return new Set(slots.map((s) => s.userId)).size
    } catch {
      return 0
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Turnusplaner</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Definer planer som gjentas etter faste intervaller og generer
            vakter fremover.
          </p>
        </div>
        <Link href="/admin/rotations/new">
          <Button>+ Ny plan</Button>
        </Link>
      </header>

      {isLoading && <p className="text-muted-foreground">Laster…</p>}

      {!isLoading && patterns.length === 0 && (
        <p className="text-muted-foreground">Ingen turnusplaner opprettet ennå.</p>
      )}

      {patterns.length > 0 && (
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="p-3">Navn</th>
              <th className="p-3">Team</th>
              <th className="p-3">Cycle</th>
              <th className="p-3">Ansatte</th>
              <th className="p-3">Handlinger</th>
            </tr>
          </thead>
          <tbody>
            {patterns.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-muted-foreground">{p.teamName}</td>
                <td className="p-3">{p.weeks} {p.weeks === 1 ? 'uke' : 'uker'}</td>
                <td className="p-3">{uniqueUsers(p.slotsJson)}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Link href={`/admin/rotations/${p.id}`}>
                      <Button variant="outline" size="sm">Rediger</Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => setGeneratingFor(p)}>
                      Generer vakter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Slette "${p.name}"?`)) deleteMutation.mutate(p.id)
                      }}
                    >
                      Slett
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {generatingFor && (
        <GenerateShiftsDialog
          pattern={generatingFor}
          onClose={() => setGeneratingFor(null)}
          onResult={(r: GenerateResult) => {
            setGeneratingFor(null)
            setResult(r)
          }}
        />
      )}
      {result && (
        <GenerateResultDialog result={result} onClose={() => setResult(null)} />
      )}
    </div>
  )
}
