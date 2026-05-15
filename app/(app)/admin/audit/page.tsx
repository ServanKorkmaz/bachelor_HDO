"use client"

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ChevronLeft, Download } from 'lucide-react'
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
import { useAuth } from '@/lib/auth/mockAuth'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import { axiosInstance } from '@/lib/axios'
import { downloadCsv } from '@/lib/export/csv'

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
  SWAP_REVOKED: 'Vaktbytte trukket tilbake',
  HOLIDAY_REQUESTED: 'Ferie forespurt',
  HOLIDAY_APPROVED: 'Ferie godkjent',
  HOLIDAY_REJECTED: 'Ferie avvist',
  HOLIDAY_REVOKED: 'Ferie tilbakekalt',
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  user: 'Bruker',
  team_membership: 'Teammedlemskap',
  swap_request: 'Vaktbytte',
  holiday_request: 'Ferie',
  User: 'Bruker',
  TeamMembership: 'Teammedlemskap',
  SwapRequest: 'Vaktbytte',
  HolidayRequest: 'Ferie',
}

const HOLIDAY_TYPE_LABELS: Record<string, string> = {
  VACATION: 'Ferie',
  SICK: 'Sykdom',
  ABSENCE: 'Fravær',
  OTHER: 'Annet',
}

/** Parse YYYY-MM-DD or ISO timestamp and format as dd.MM.yyyy. Returns the
 * raw string if parsing fails so we never silently swallow weird data. */
function formatDate(value: string | undefined | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return format(date, 'dd.MM.yyyy', { locale: nb })
}

/** Admin revisjonslogg: viser hvem som gjorde hva og når. */
export default function AdminAuditPage() {
  const { currentUser } = useAuth()
  const { toast } = useToast()
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  const { data: entries = [], isLoading: loading } = useQuery<AuditEntry[]>({
    queryKey: ['admin-audit', currentUser?.id, entityFilter, dateFrom, dateTo],
    queryFn: async () => {
      if (!currentUser?.id) return []
      const params = new URLSearchParams()
      params.set('currentUserId', currentUser.id)
      if (entityFilter !== 'all') params.set('entityType', entityFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      try {
        const res = await axiosInstance.get(`/api/admin/audit?${params.toString()}`)
        return Array.isArray(res.data) ? res.data : []
      } catch (_error: unknown) {
        toast({ title: 'Feil', description: 'Kunne ikke hente revisjonslogg', variant: 'destructive' })
        return []
      }
    },
    enabled: Boolean(currentUser?.id),
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
    enabled: Boolean(currentUser?.id),
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

  /** Parse the JSON snapshot stored on the audit row. Returns an empty object
   * if the data is missing or malformed — callers handle the "no fields" case
   * explicitly. */
  const parseSnapshot = (e: AuditEntry): Record<string, unknown> => {
    const json = e.afterJson || e.beforeJson
    if (!json) return {}
    try {
      const data = JSON.parse(json)
      return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  /** Human-readable description of the affected entity. Reads from the JSON
   * snapshot stored at audit time; falls back to "(uten detaljer)" rather
   * than leaking the raw CUID when the snapshot lacks display fields. */
  const entityDisplay = (e: AuditEntry): string => {
    const type = (e.entityType ?? '').toLowerCase()
    const snap = parseSnapshot(e)

    if (type === 'user') {
      return userNames[e.entityId] ?? '(uten detaljer)'
    }

    if (type === 'team_membership') {
      const userId = typeof snap.userId === 'string' ? snap.userId : undefined
      const teamId = typeof snap.teamId === 'string' ? snap.teamId : undefined
      if (userId || teamId) {
        const userName = userId ? (userNames[userId] ?? '(ukjent bruker)') : '?'
        const teamName = teamId ? (teamNames[teamId] ?? '(ukjent team)') : '?'
        return `${userName} i ${teamName}`
      }
      return '(uten detaljer)'
    }

    if (type === 'swap_request') {
      const fromUserId = typeof snap.fromUserId === 'string' ? snap.fromUserId : undefined
      const toUserId = typeof snap.toUserId === 'string' ? snap.toUserId : undefined
      const shiftDate = typeof snap.shiftDate === 'string' ? snap.shiftDate : undefined
      if (!fromUserId && !toUserId && !shiftDate) return '(uten detaljer)'
      const fromName = fromUserId ? (userNames[fromUserId] ?? '(ukjent)') : '?'
      const toName = toUserId ? (userNames[toUserId] ?? '(ukjent)') : '?'
      const dateSuffix = shiftDate ? `, ${formatDate(shiftDate)}` : ''
      return `${fromName} → ${toName}${dateSuffix}`
    }

    if (type === 'holiday_request') {
      const userId = typeof snap.userId === 'string' ? snap.userId : undefined
      const holidayType = typeof snap.type === 'string' ? snap.type : undefined
      const dateFromVal = typeof snap.dateFrom === 'string' ? snap.dateFrom : undefined
      const dateToVal = typeof snap.dateTo === 'string' ? snap.dateTo : undefined
      if (!userId && !holidayType && !dateFromVal) return '(uten detaljer)'
      const userName = userId ? (userNames[userId] ?? '(ukjent)') : '?'
      const typeLabel = holidayType ? (HOLIDAY_TYPE_LABELS[holidayType] ?? holidayType) : ''
      const range =
        dateFromVal && dateToVal
          ? `${formatDate(dateFromVal)} – ${formatDate(dateToVal)}`
          : dateFromVal
            ? formatDate(dateFromVal)
            : ''
      return [userName, typeLabel, range].filter(Boolean).join(' · ')
    }

    return '(uten detaljer)'
  }

  const handleDownloadCsv = async () => {
    if (entries.length === 0) {
      toast({ title: 'Tom logg', description: 'Ingen oppføringer å laste ned.' })
      return
    }
    const today = format(new Date(), 'yyyy-MM-dd')
    const range = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : dateFrom || dateTo || today
    await downloadCsv(
      entries,
      [
        {
          header: 'Dato og tid',
          accessor: (row) => format(new Date(row.createdAt), 'dd.MM.yyyy HH:mm', { locale: nb }),
        },
        { header: 'Utført av', accessor: (row) => actorName(row.actorUserId) },
        { header: 'Handling', accessor: (row) => actionLabel(row.action) },
        { header: 'Entitet-type', accessor: (row) => entityTypeLabel(row.entityType) },
        { header: 'Entitet', accessor: (row) => entityDisplay(row) },
        { header: 'Entitet-ID', accessor: (row) => row.entityId },
        { header: 'Før (JSON)', accessor: (row) => row.beforeJson ?? '' },
        { header: 'Etter (JSON)', accessor: (row) => row.afterJson ?? '' },
      ],
      `revisjonslogg_${range}.csv`,
    )
  }

  if (!currentUser) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Revisjonslogg</h1>
          <p className="text-muted-foreground mt-1">
            Oversikt over endringer i brukere, tilgang, vaktbytter og ferie. Hvem gjorde hva og når.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Tilbake til Admin
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-entity-filter" className="text-sm font-medium">
            Filtrer på type
          </Label>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger id="audit-entity-filter" className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="user">Bruker</SelectItem>
              <SelectItem value="team_membership">Teammedlemskap</SelectItem>
              <SelectItem value="swap_request">Vaktbytte</SelectItem>
              <SelectItem value="holiday_request">Ferie</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-date-from" className="text-sm font-medium">
            Fra dato
          </Label>
          <Input
            id="audit-date-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => setDateFrom(event.target.value)}
            className="w-[160px]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-date-to" className="text-sm font-medium">
            Til dato
          </Label>
          <Input
            id="audit-date-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-[160px]"
          />
        </div>

        {(dateFrom || dateTo) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDateFrom('')
              setDateTo('')
            }}
          >
            Tøm datofilter
          </Button>
        )}

        <div className="ml-auto">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadCsv}
            disabled={loading || entries.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Last ned CSV
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Laster …</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Ingen loggføringer funnet for valgt filter.
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
