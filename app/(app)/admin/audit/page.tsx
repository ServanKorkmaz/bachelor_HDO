"use client"

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth/mockAuth'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import { axiosInstance } from '@/lib/axios'

type AuditEntry = {
  id: string
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  beforeJson: string | null
  afterJson: string | null
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  USER_CREATED: 'Bruker opprettet',
  USER_STATUS_CHANGED: 'Brukerstatus endret',
  MEMBER_ADDED: 'Lagt til i team',
  MEMBERSHIP_UPDATED: 'Teamrolle endret',
  MEMBER_REMOVED: 'Fjernet fra team',
  SWAP_REQUESTED: 'Vaktbytte forespurt',
  SWAP_APPROVED: 'Vaktbytte godkjent',
  SWAP_REJECTED: 'Vaktbytte avvist',
  SWAP_EXECUTED: 'Vaktbytte utført',
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  user: 'Bruker',
  team_membership: 'Teammedlemskap',
  swap_request: 'Vaktbytte',
  User: 'Bruker',
  TeamMembership: 'Teammedlemskap',
  SwapRequest: 'Vaktbytte',
}

/** Admin revisjonslogg: viser hvem som gjorde hva og når (brukere og tilgang). */
export default function AdminAuditPage() {
  const { currentUser, isAdmin } = useAuth()
  const { toast } = useToast()
  const [entityFilter, setEntityFilter] = useState<string>('all')

  const { data: entries = [], isLoading: loading } = useQuery<AuditEntry[]>({
    queryKey: ['admin-audit', currentUser?.id, entityFilter],
    queryFn: async () => {
      if (!currentUser?.id) return []
      const params = new URLSearchParams()
      params.set('currentUserId', currentUser.id)
      if (entityFilter !== 'all') params.set('entityType', entityFilter)
      try {
        const res = await axiosInstance.get(`/api/admin/audit?${params.toString()}`)
        return Array.isArray(res.data) ? res.data : []
      } catch (error: any) {
        if (error?.response?.status === 403 || error?.response?.status === 401) {
          toast({ title: 'Ikke tilgang', description: 'Kun admin kan se revisjonsloggen.', variant: 'destructive' })
          return []
        }
        toast({ title: 'Feil', description: 'Kunne ikke hente revisjonslogg', variant: 'destructive' })
        return []
      }
    },
    enabled: Boolean(currentUser?.id && isAdmin()),
  })

  const { data: usersList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['admin-users', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return []
      const res = await axiosInstance.get('/api/admin/users', {
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-id': currentUser.id,
        },
      })
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(currentUser?.id && isAdmin()),
  })

  const { data: teamsList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/teams')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const userNames = useMemo(() => {
    const map: Record<string, string> = {}
    usersList.forEach((u) => {
      map[u.id] = u.name
    })
    return map
  }, [usersList])

  const teamNames = useMemo(() => {
    const map: Record<string, string> = {}
    teamsList.forEach((t) => {
      map[t.id] = t.name
    })
    return map
  }, [teamsList])

  const actorName = (userId: string) => userNames[userId] ?? userId
  const actionLabel = (action: string) => ACTION_LABELS[action] ?? action
  const entityTypeLabel = (type: string) => ENTITY_TYPE_LABELS[type] ?? type

  /** Lesbar beskrivelse av entiteten: brukernavn for user, "Brukernavn i Teamnavn" for team_membership, "From → To, dato" for swap_request. */
  const entityDisplay = (e: AuditEntry): string => {
    const type = (e.entityType ?? '').toLowerCase()
    if (type === 'user') {
      return userNames[e.entityId] ?? e.entityId
    }
    if (type === 'team_membership') {
      const json = e.afterJson || e.beforeJson
      if (json) {
        try {
          const data = JSON.parse(json) as { userId?: string; teamId?: string }
          const userName = data.userId ? (userNames[data.userId] ?? data.userId) : '?'
          const teamName = data.teamId ? (teamNames[data.teamId] ?? data.teamId) : '?'
          return `${userName} i ${teamName}`
        } catch {
          // ignore
        }
      }
      return `Medlemskap (${e.entityId.slice(0, 8)}…)`
    }
    if (type === 'swap_request') {
      const json = e.afterJson || e.beforeJson
      if (json) {
        try {
          const data = JSON.parse(json) as {
            fromUserId?: string
            toUserId?: string
            shiftDate?: string
          }
          const fromName = data.fromUserId ? (userNames[data.fromUserId] ?? data.fromUserId) : '?'
          const toName = data.toUserId ? (userNames[data.toUserId] ?? data.toUserId) : '?'
          const date = data.shiftDate ? `, ${data.shiftDate}` : ''
          return `${fromName} → ${toName}${date}`
        } catch {
          // ignore
        }
      }
      return `Vaktbytte (${e.entityId.slice(0, 8)}…)`
    }
    return `${entityTypeLabel(e.entityType)} (${e.entityId.slice(0, 8)}…)`
  }

  if (!currentUser) return null
  if (!isAdmin()) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Kun administratorer kan se revisjonsloggen.</p>
        <Button variant="outline" asChild>
          <Link href="/admin">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Tilbake til Admin
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Revisjonslogg</h1>
          <p className="text-muted-foreground mt-1">
            Oversikt over endringer i brukere, tilgang og vaktbytter. Hvem gjorde hva og når.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Tilbake til Admin
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Filtrer på type:</span>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="user">Bruker</SelectItem>
              <SelectItem value="team_membership">Teammedlemskap</SelectItem>
              <SelectItem value="swap_request">Vaktbytte</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Laster …</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Ingen loggføringer funnet. Endringer i Brukere og tilgang vises her.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Dato og tid</th>
                  <th className="text-left p-3 font-medium">Utført av</th>
                  <th className="text-left p-3 font-medium">Handling</th>
                  <th className="text-left p-3 font-medium">Entitet</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {format(new Date(e.createdAt), 'dd.MM.yyyy HH:mm', { locale: nb })}
                    </td>
                    <td className="p-3">{actorName(e.actorUserId)}</td>
                    <td className="p-3">{actionLabel(e.action)}</td>
                    <td className="p-3">{entityDisplay(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
