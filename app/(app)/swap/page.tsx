"use client"

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { formatDateDisplay, formatTime } from '@/lib/date-utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { statusToNorwegian } from '@/lib/i18n'
import { axiosInstance } from '@/lib/axios'

/** Compact shift picker: shows a scrollable list when nothing is selected, collapses to the selected item when one is chosen. Double-click the selected item to deselect and expand again. */
function ShiftPickerList({
  shifts,
  value,
  onChange,
  emptyLabel = 'Ingen vakter i perioden',
}: {
  shifts: any[]
  value: string
  onChange: (id: string) => void
  emptyLabel?: string
}) {
  const selected = shifts.find((s: any) => s.id === value)

  if (selected) {
    return (
      <div
        onDoubleClick={() => onChange('')}
        className="rounded-md border bg-primary/10 px-3 py-2 text-sm font-medium cursor-pointer flex items-center gap-2 select-none"
      >
        <span className="h-3 w-3 rounded-full border-2 border-primary bg-primary shrink-0" />
        <span className="flex-1">
          {formatDateDisplay(selected.date)} – {selected.shiftType?.label ?? 'Vakt'} ({formatTime(selected.startDateTime)}–{formatTime(selected.endDateTime)})
        </span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">Dobbeltklikk for å fjerne</span>
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-muted/30 max-h-44 overflow-y-auto">
      {shifts.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border">
          {shifts.map((shift: any) => (
            <li
              key={shift.id}
              onClick={() => onChange(shift.id)}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors"
            >
              <span className="h-3 w-3 rounded-full border-2 border-muted-foreground shrink-0" />
              {formatDateDisplay(shift.date)} – {shift.shiftType?.label ?? 'Vakt'} ({formatTime(shift.startDateTime)}–{formatTime(shift.endDateTime)})
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Shift swap request page with create/approve flows. */
export default function SwapPage() {
  const queryClient = useQueryClient()
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState<string>('')
  const [selectedToUserId, setSelectedToUserId] = useState<string>('')
  const [selectedToShiftId, setSelectedToShiftId] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('failed to load user')
      return res.json() as Promise<{ id: string; name: string; email: string; role: 'ADMIN' | 'LEADER' | 'EMPLOYEE'; teamId: string }>
    },
  })
  const canApproveSwaps = me?.role === 'ADMIN' || me?.role === 'LEADER'
  const { toast } = useToast()
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    destructive?: boolean
    onConfirm: () => Promise<void>
  }>({ open: false, title: '', description: '', onConfirm: async () => {} })

  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }))

  const { data: teams = [] } = useQuery<any[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await axiosInstance.get('/api/teams')
      return Array.isArray(response.data) ? response.data : []
    },
  })

  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id)
    }
  }, [teams, selectedTeamId])

  // Brukere i valgt team (for «Bytt med») – bruk teamId så TeamMembership inkluderes
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['users', selectedTeamId],
    queryFn: async () => {
      const response = await axiosInstance.get(`/api/users?teamId=${selectedTeamId}`)
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: Boolean(selectedTeamId),
  })

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + mondayOffset)
    return {
      dateFrom: format(weekStart, 'yyyy-MM-dd'),
      dateTo: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    }
  }, [])

  const { data: swapRequests = [] } = useQuery<any[]>({
    queryKey: ['swap-requests', selectedTeamId],
    queryFn: async () => {
      const response = await axiosInstance.get(`/api/swap-requests?teamId=${selectedTeamId}`)
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: Boolean(selectedTeamId),
  })

  const { data: shifts = [] } = useQuery<any[]>({
    queryKey: ['shifts', selectedTeamId, dateFrom, dateTo],
    queryFn: async () => {
      const response = await axiosInstance.get(
        `/api/shifts?teamId=${selectedTeamId}&dateFrom=${dateFrom}&dateTo=${dateTo}`
      )
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: Boolean(selectedTeamId),
  })

  const myShifts = shifts.filter(
    (s: any) => (s.userId ?? s.user?.id) === me?.id
  )

  const { data: colleagueShifts = [] } = useQuery<any[]>({
    queryKey: ['shifts', selectedTeamId, selectedToUserId, dateFrom, dateTo],
    queryFn: async () => {
      const response = await axiosInstance.get(
        `/api/shifts?teamId=${selectedTeamId}&dateFrom=${dateFrom}&dateTo=${dateTo}&userId=${selectedToUserId}`
      )
      return Array.isArray(response.data) ? response.data : []
    },
    enabled: Boolean(selectedTeamId && selectedToUserId),
  })

  const refreshSwapData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['swap-requests', selectedTeamId] }),
      queryClient.invalidateQueries({ queryKey: ['shifts', selectedTeamId, dateFrom, dateTo] }),
      queryClient.invalidateQueries({ queryKey: ['shifts', selectedTeamId, selectedToUserId, dateFrom, dateTo] }),
    ])
  }

  const handleCreateRequest = async () => {
    if (!selectedShiftId || !selectedToUserId) return

    try {
      await axiosInstance.post('/api/swap-requests', {
        teamId: selectedTeamId,
        shiftId: selectedShiftId,
        toShiftId: selectedToShiftId || null,
        toUserId: selectedToUserId,
        message: message || undefined,
      })

      setIsCreateModalOpen(false)
      setSelectedShiftId('')
      setSelectedToUserId('')
      setSelectedToShiftId('')
      setMessage('')
      await refreshSwapData()
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Kunne ikke opprette vaktbytteforespørsel'
      toast({ title: 'Feil', description: msg, variant: 'destructive' })
    }
  }

  const handleApprove = async (requestId: string) => {
    if (!me?.id) return
    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/approve`,
        {},
      )
      await refreshSwapData()
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Kunne ikke godkjenne forespørsel'
      toast({ title: 'Feil', description: msg, variant: 'destructive' })
    }
  }

  const handleReject = async (requestId: string) => {
    if (!me?.id) return
    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/reject`,
        {},
      )
      await refreshSwapData()
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Kunne ikke avvise forespørsel'
      toast({ title: 'Feil', description: msg, variant: 'destructive' })
    }
  }

  const handleCancel = (requestId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Avbryt forespørsel',
      description: 'Er du sikker på at du vil avbryte denne vaktbytteforespørselen?',
      destructive: true,
      onConfirm: async () => {
        try {
          await axiosInstance.delete(`/api/swap-requests/${requestId}`)
          await refreshSwapData()
        } catch (error: any) {
          const msg = error?.response?.data?.error || 'Kunne ikke avbryte forespørsel'
          toast({ title: 'Feil', description: msg, variant: 'destructive' })
        }
      },
    })
  }

  const handleAccept = async (requestId: string) => {
    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/accept`,
        {},
      )
      await refreshSwapData()
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Kunne ikke godta forespørsel'
      toast({ title: 'Feil', description: msg, variant: 'destructive' })
    }
  }

  const handleDecline = (requestId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Avslå forespørsel',
      description: 'Er du sikker på at du vil avslå denne vaktbytteforespørselen?',
      destructive: true,
      onConfirm: async () => {
        try {
          await axiosInstance.post(
            `/api/swap-requests/${requestId}/decline`,
            {},
          )
          await refreshSwapData()
        } catch (error: any) {
          const msg = error?.response?.data?.error || 'Kunne ikke avslå forespørsel'
          toast({ title: 'Feil', description: msg, variant: 'destructive' })
        }
      },
    })
  }

  const handleRevoke = async (requestId: string) => {
    if (!me?.id) return
    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/revoke`,
        {},
      )
      await refreshSwapData()
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Kunne ikke trekke tilbake beslutningen'
      toast({ title: 'Feil', description: msg, variant: 'destructive' })
    }
  }

  const handleExecute = (requestId: string) => {
    if (!me?.id) return
    setConfirmDialog({
      open: true,
      title: 'Utfør vaktbytte',
      description: 'Vakten blir overført til ny person. Dette kan ikke angres etter utførelse.',
      onConfirm: async () => {
        try {
          await axiosInstance.post(
            `/api/swap-requests/${requestId}/execute`,
            {},
          )
          await refreshSwapData()
        } catch (error: any) {
          const msg = error?.response?.data?.error || 'Kunne ikke utføre vaktbytte'
          toast({ title: 'Feil', description: msg, variant: 'destructive' })
        }
      },
    })
  }

  const pendingRequests = swapRequests.filter((r: any) => r.status === 'PENDING')
  const awaitingRequests = swapRequests.filter((r: any) => r.status === 'AWAITING_ACCEPTANCE')
  const otherRequests = swapRequests.filter((r: any) => r.status !== 'PENDING' && r.status !== 'AWAITING_ACCEPTANCE')
  const myRequests = swapRequests.filter(
    (r: any) => r.requestedByUserId === me?.id
  )
  const incomingRequests = swapRequests.filter(
    (r: any) => r.toUserId === me?.id && r.status === 'AWAITING_ACCEPTANCE'
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Vaktbytter</h1>
        {me && me.role !== 'ADMIN' && me.role !== 'LEADER' && (
          <Button onClick={() => setIsCreateModalOpen(true)}>
            Be om vaktbytte
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4 p-4 bg-card rounded-lg border">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Plan:</label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="px-3 py-1 rounded-md border bg-background text-foreground"
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {canApproveSwaps && awaitingRequests.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Venter på kollegas svar</h2>
          <div className="space-y-2">
            {awaitingRequests.map((request: any) => (
              <div
                key={request.id}
                className="p-4 bg-card rounded-lg border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium mb-2">
                      {request.fromUser.name} → {request.toUser.name}
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      {formatDateDisplay(request.shift.date)} - {request.shift.shiftType.label}
                    </div>
                    {request.message && (
                      <div className="text-sm mb-2">{request.message}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Forespurt av {request.requestedBy.name} - {format(new Date(request.createdAt), 'dd.MM.yyyy HH:mm')}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 font-medium whitespace-nowrap">
                    Venter svar fra {request.toUser.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {canApproveSwaps && pendingRequests.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Venter på godkjenning</h2>
          <div className="space-y-2">
            {pendingRequests.map((request: any) => (
              <div
                key={request.id}
                className="p-4 bg-card rounded-lg border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium mb-2">
                      {request.fromUser.name} → {request.toUser.name}
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      {formatDateDisplay(request.shift.date)} - {request.shift.shiftType.label}
                    </div>
                    {request.message && (
                      <div className="text-sm mb-2">{request.message}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Forespurt av {request.requestedBy.name} - {format(new Date(request.createdAt), 'dd.MM.yyyy HH:mm')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReject(request.id)}
                    >
                      Avvis
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(request.id)}
                    >
                      Godkjenn
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!canApproveSwaps && incomingRequests.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Inngående forespørsler</h2>
          <div className="space-y-2">
            {incomingRequests.map((request: any) => (
              <div
                key={request.id}
                className="p-4 bg-card rounded-lg border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium mb-2">
                      {request.fromUser.name} → {request.toUser.name}
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      {formatDateDisplay(request.shift.date)} - {request.shift.shiftType.label}
                    </div>
                    {request.message && (
                      <div className="text-sm mb-2">{request.message}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Forespurt av {request.requestedBy.name} - {format(new Date(request.createdAt), 'dd.MM.yyyy HH:mm')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDecline(request.id)}
                    >
                      Avslå
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAccept(request.id)}
                    >
                      Godta
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4">
          {canApproveSwaps ? 'Alle forespørsler' : 'Mine forespørsler'}
        </h2>
        <div className="space-y-2">
          {(canApproveSwaps ? otherRequests : myRequests).length === 0 ? (
            <p className="text-muted-foreground">
              {canApproveSwaps ? 'Ingen forespørsler' : 'Ingen forespørsler'}
            </p>
          ) : (
            (canApproveSwaps ? otherRequests : myRequests).map((request: any) => (
              <div
                key={request.id}
                className="p-4 bg-card rounded-lg border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">
                        {request.fromUser.name} → {request.toUser.name}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        request.status === 'APPROVED' ? 'bg-green-500/20 text-green-500' :
                        request.status === 'REJECTED' ? 'bg-red-500/20 text-red-500' :
                        request.status === 'EXECUTED' ? 'bg-blue-500/20 text-blue-500' :
                        request.status === 'PENDING' ? 'bg-amber-500/20 text-amber-500' :
                        request.status === 'AWAITING_ACCEPTANCE' ? 'bg-amber-100 text-amber-700' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {statusToNorwegian(request.status)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      {formatDateDisplay(request.shift.date)} - {request.shift.shiftType.label}
                    </div>
                    {request.message && (
                      <div className="text-sm mb-2">{request.message}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(request.createdAt), 'dd.MM.yyyy HH:mm')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {canApproveSwaps && request.status === 'APPROVED' && (
                      <Button
                        size="sm"
                        onClick={() => handleExecute(request.id)}
                      >
                        Utfør bytte
                      </Button>
                    )}
                    {canApproveSwaps && (request.status === 'APPROVED' || request.status === 'REJECTED') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(request.id)}
                      >
                        Trekk tilbake
                      </Button>
                    )}
                    {!canApproveSwaps && request.requestedByUserId === me?.id &&
                      (request.status === 'PENDING' || request.status === 'AWAITING_ACCEPTANCE') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancel(request.id)}
                      >
                        Avbryt
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && closeConfirm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeConfirm}>Avbryt</Button>
            <Button
              variant={confirmDialog.destructive ? 'destructive' : 'default'}
              onClick={async () => { closeConfirm(); await confirmDialog.onConfirm() }}
            >
              Bekreft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Be om vaktbytte</DialogTitle>
            <DialogDescription>
              Velg vakt du vil bytte og hvem du vil bytte med
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Din vakt du vil bytte bort</Label>
              <ShiftPickerList
                shifts={myShifts}
                value={selectedShiftId}
                onChange={setSelectedShiftId}
              />
            </div>
            <div className="space-y-2">
              <Label>Bytt med</Label>
              <Select value={selectedToUserId} onValueChange={(v) => { setSelectedToUserId(v); setSelectedToShiftId('') }}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg ansatt" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u: any) => u.id !== me?.id)
                    .map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {selectedToUserId && (
              <div className="space-y-2">
                <Label>
                  Vakt fra {users.find((u: any) => u.id === selectedToUserId)?.name ?? 'kollegaen'} (valgfritt)
                </Label>
                <ShiftPickerList
                  shifts={colleagueShifts}
                  value={selectedToShiftId}
                  onChange={setSelectedToShiftId}
                  emptyLabel="Ingen vakter i perioden"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Melding (valgfritt)</Label>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Skriv melding..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleCreateRequest}
              disabled={!selectedShiftId || !selectedToUserId}
            >
              Send forespørsel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

