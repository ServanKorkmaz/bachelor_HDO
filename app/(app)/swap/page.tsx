"use client"

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth/mockAuth'
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
import { axiosInstance } from '@/lib/axios'

/** Shift swap request page with create/approve flows. */
export default function SwapPage() {
  const queryClient = useQueryClient()
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState<string>('')
  const [selectedToUserId, setSelectedToUserId] = useState<string>('')
  const [selectedToShiftId, setSelectedToShiftId] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const { currentUser, canApproveSwaps } = useAuth()

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
    (s: any) => (s.userId ?? s.user?.id) === currentUser?.id
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
    if (!selectedShiftId || !selectedToUserId || !currentUser) return

    try {
      await axiosInstance.post('/api/swap-requests', {
        teamId: selectedTeamId,
        requestedByUserId: currentUser.id,
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
    } catch (error) {
      console.error('Error creating swap request:', error)
      alert('Kunne ikke opprette vaktbytteforespørsel')
    }
  }

  const handleApprove = async (requestId: string) => {
    if (!currentUser?.id) return
    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/approve`,
        { currentUserId: currentUser.id },
        { headers: { 'x-current-user-id': currentUser.id } }
      )
      await refreshSwapData()
    } catch (error) {
      console.error('Error approving swap request:', error)
      alert('Kunne ikke godkjenne forespørsel')
    }
  }

  const handleReject = async (requestId: string) => {
    if (!currentUser?.id) return
    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/reject`,
        { currentUserId: currentUser.id },
        { headers: { 'x-current-user-id': currentUser.id } }
      )
      await refreshSwapData()
    } catch (error) {
      console.error('Error rejecting swap request:', error)
      alert('Kunne ikke avvise forespørsel')
    }
  }

  const handleCancel = async (requestId: string) => {
    if (!confirm('Er du sikker på at du vil avbryte denne forespørselen?')) return
    try {
      await axiosInstance.delete(`/api/swap-requests/${requestId}?currentUserId=${currentUser?.id}`)
      await refreshSwapData()
    } catch { alert('Kunne ikke avbryte forespørsel') }
  }

  const handleAccept = async (requestId: string) => {
    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/accept`,
        {},
        { headers: { 'x-current-user-id': currentUser?.id ?? '' } }
      )
      await refreshSwapData()
    } catch { alert('Nettverksfeil') }
  }

  const handleDecline = async (requestId: string) => {
    if (!confirm('Er du sikker på at du vil avslå denne forespørselen?')) return
    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/decline`,
        {},
        { headers: { 'x-current-user-id': currentUser?.id ?? '' } }
      )
      await refreshSwapData()
    } catch { alert('Nettverksfeil') }
  }

  const handleRevoke = async (requestId: string) => {
    if (!currentUser?.id) return
    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/revoke`,
        {},
        { headers: { 'x-current-user-id': currentUser.id } }
      )
      await refreshSwapData()
    } catch (error) {
      console.error('Error revoking swap decision:', error)
      alert('Kunne ikke trekke tilbake beslutningen')
    }
  }

  const handleExecute = async (requestId: string) => {
    if (!currentUser?.id) return
    if (!confirm('Er du sikker på at du vil utføre dette vaktbyttet?')) return

    try {
      await axiosInstance.post(
        `/api/swap-requests/${requestId}/execute`,
        { currentUserId: currentUser.id },
        { headers: { 'x-current-user-id': currentUser.id } }
      )
      await refreshSwapData()
    } catch (error) {
      console.error('Error executing swap request:', error)
      alert('Kunne ikke utføre vaktbytte')
    }
  }

  const pendingRequests = swapRequests.filter((r: any) => r.status === 'PENDING')
  const awaitingRequests = swapRequests.filter((r: any) => r.status === 'AWAITING_ACCEPTANCE')
  const otherRequests = swapRequests.filter((r: any) => r.status !== 'PENDING' && r.status !== 'AWAITING_ACCEPTANCE')
  const myRequests = swapRequests.filter(
    (r: any) => r.requestedByUserId === currentUser?.id
  )
  const incomingRequests = swapRequests.filter(
    (r: any) => r.toUserId === currentUser?.id && r.status === 'AWAITING_ACCEPTANCE'
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Vaktbytter</h1>
        {currentUser && currentUser.role !== 'ADMIN' && currentUser.role !== 'LEADER' && (
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

      {canApproveSwaps() && awaitingRequests.length > 0 && (
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

      {canApproveSwaps() && pendingRequests.length > 0 && (
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

      {!canApproveSwaps() && incomingRequests.length > 0 && (
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
          {canApproveSwaps() ? 'Alle forespørsler' : 'Mine forespørsler'}
        </h2>
        <div className="space-y-2">
          {(canApproveSwaps() ? otherRequests : myRequests).length === 0 ? (
            <p className="text-muted-foreground">
              {canApproveSwaps() ? 'Ingen forespørsler' : 'Ingen forespørsler'}
            </p>
          ) : (
            (canApproveSwaps() ? otherRequests : myRequests).map((request: any) => (
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
                        {request.status === 'PENDING' ? 'Venter på leder' :
                         request.status === 'AWAITING_ACCEPTANCE' ? 'Venter svar' :
                         request.status === 'APPROVED' ? 'Godkjent' :
                         request.status === 'REJECTED' ? 'Avslått' :
                         request.status}
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
                    {canApproveSwaps() && request.status === 'APPROVED' && (
                      <Button
                        size="sm"
                        onClick={() => handleExecute(request.id)}
                      >
                        Utfør bytte
                      </Button>
                    )}
                    {canApproveSwaps() && (request.status === 'APPROVED' || request.status === 'REJECTED') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(request.id)}
                      >
                        Trekk tilbake
                      </Button>
                    )}
                    {!canApproveSwaps() && request.requestedByUserId === currentUser?.id &&
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
              <Label>Velg vakt</Label>
              <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg vakt" />
                </SelectTrigger>
                <SelectContent>
                  {myShifts.map((shift: any) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {formatDateDisplay(shift.date)} - {shift.shiftType.label} ({formatTime(shift.startDateTime)} - {formatTime(shift.endDateTime)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bytt med</Label>
              <Select value={selectedToUserId} onValueChange={(v) => { setSelectedToUserId(v); setSelectedToShiftId('') }}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg ansatt" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u: any) => u.id !== currentUser?.id)
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
                  Velg vakt fra {users.find((u: any) => u.id === selectedToUserId)?.name ?? 'kollegaen'} (valgfritt)
                </Label>
                <div className="rounded-md border bg-muted/30 max-h-48 overflow-y-auto">
                  {colleagueShifts.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Ingen vakter i perioden</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {colleagueShifts.map((shift: any) => (
                        <li
                          key={shift.id}
                          onClick={() => setSelectedToShiftId(shift.id === selectedToShiftId ? '' : shift.id)}
                          className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors ${
                            selectedToShiftId === shift.id ? 'bg-primary/10 font-medium' : ''
                          }`}
                        >
                          <span className={`h-3 w-3 rounded-full border-2 shrink-0 ${
                            selectedToShiftId === shift.id ? 'border-primary bg-primary' : 'border-muted-foreground'
                          }`} />
                          {formatDateDisplay(shift.date)} – {shift.shiftType?.label ?? 'Vakt'} ({formatTime(shift.startDateTime)}–{formatTime(shift.endDateTime)})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {selectedToShiftId && (
                  <p className="text-xs text-muted-foreground">
                    Valgt: klikk igjen for å fjerne valget
                  </p>
                )}
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

