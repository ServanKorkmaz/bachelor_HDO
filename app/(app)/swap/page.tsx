"use client"

import { useState, useEffect } from 'react'
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

export default function SwapPage() {
  const [swapRequests, setSwapRequests] = useState<any[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState<string>('')
  const [selectedToUserId, setSelectedToUserId] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const { currentUser, canApproveSwaps } = useAuth()

  useEffect(() => {
    fetch('/api/teams')
      .then(res => res.json())
      .then(data => {
        setTeams(data)
        if (data.length > 0 && !selectedTeamId) {
          setSelectedTeamId(data[0].id)
        }
      })
      .catch(console.error)

    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedTeamId) return

    fetch(`/api/swap-requests?teamId=${selectedTeamId}`)
      .then(res => res.json())
      .then(data => setSwapRequests(data))
      .catch(console.error)

    const today = format(new Date(), 'yyyy-MM-dd')
    const futureDate = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
    fetch(`/api/shifts?teamId=${selectedTeamId}&dateFrom=${today}&dateTo=${futureDate}`)
      .then(res => res.json())
      .then(data => setShifts(data))
      .catch(console.error)
  }, [selectedTeamId])

  const myShifts = shifts.filter((s: any) => s.userId === currentUser?.id)

  const handleCreateRequest = async () => {
    if (!selectedShiftId || !selectedToUserId || !currentUser) return

    try {
      const response = await fetch('/api/swap-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeamId,
          requestedByUserId: currentUser.id,
          shiftId: selectedShiftId,
          toUserId: selectedToUserId,
          message: message || undefined,
        }),
      })

      if (response.ok) {
        setIsCreateModalOpen(false)
        setSelectedShiftId('')
        setSelectedToUserId('')
        setMessage('')
        // Refresh requests
        fetch(`/api/swap-requests?teamId=${selectedTeamId}`)
          .then(res => res.json())
          .then(data => setSwapRequests(data))
          .catch(console.error)
      } else {
        alert('Kunne ikke opprette vaktbytteforespørsel')
      }
    } catch (error) {
      console.error('Error creating swap request:', error)
      alert('Kunne ikke opprette vaktbytteforespørsel')
    }
  }

  const handleApprove = async (requestId: string) => {
    try {
      const response = await fetch(`/api/swap-requests/${requestId}/approve`, {
        method: 'POST',
      })

      if (response.ok) {
        // Refresh requests
        fetch(`/api/swap-requests?teamId=${selectedTeamId}`)
          .then(res => res.json())
          .then(data => setSwapRequests(data))
          .catch(console.error)
      } else {
        alert('Kunne ikke godkjenne forespørsel')
      }
    } catch (error) {
      console.error('Error approving swap request:', error)
      alert('Kunne ikke godkjenne forespørsel')
    }
  }

  const handleReject = async (requestId: string) => {
    try {
      const response = await fetch(`/api/swap-requests/${requestId}/reject`, {
        method: 'POST',
      })

      if (response.ok) {
        // Refresh requests
        fetch(`/api/swap-requests?teamId=${selectedTeamId}`)
          .then(res => res.json())
          .then(data => setSwapRequests(data))
          .catch(console.error)
      } else {
        alert('Kunne ikke avvise forespørsel')
      }
    } catch (error) {
      console.error('Error rejecting swap request:', error)
      alert('Kunne ikke avvise forespørsel')
    }
  }

  const handleExecute = async (requestId: string) => {
    if (!confirm('Er du sikker på at du vil utføre dette vaktbyttet?')) return

    try {
      const response = await fetch(`/api/swap-requests/${requestId}/execute`, {
        method: 'POST',
      })

      if (response.ok) {
        // Refresh requests and shifts
        fetch(`/api/swap-requests?teamId=${selectedTeamId}`)
          .then(res => res.json())
          .then(data => setSwapRequests(data))
          .catch(console.error)
        const today = format(new Date(), 'yyyy-MM-dd')
        const futureDate = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
        fetch(`/api/shifts?teamId=${selectedTeamId}&dateFrom=${today}&dateTo=${futureDate}`)
          .then(res => res.json())
          .then(data => setShifts(data))
          .catch(console.error)
      } else {
        alert('Kunne ikke utføre vaktbytte')
      }
    } catch (error) {
      console.error('Error executing swap request:', error)
      alert('Kunne ikke utføre vaktbytte')
    }
  }

  const pendingRequests = swapRequests.filter((r: any) => r.status === 'PENDING')
  const otherRequests = swapRequests.filter((r: any) => r.status !== 'PENDING')

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

      <section>
        <h2 className="text-xl font-semibold mb-4">
          {canApproveSwaps() ? 'Alle forespørsler' : 'Mine forespørsler'}
        </h2>
        <div className="space-y-2">
          {otherRequests.length === 0 ? (
            <p className="text-muted-foreground">Ingen forespørsler</p>
          ) : (
            otherRequests.map((request: any) => (
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
                        'bg-orange-500/20 text-orange-500'
                      }`}>
                        {request.status}
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
                  {canApproveSwaps() && request.status === 'APPROVED' && (
                    <Button
                      size="sm"
                      onClick={() => handleExecute(request.id)}
                    >
                      Utfør bytte
                    </Button>
                  )}
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
              <Select value={selectedToUserId} onValueChange={setSelectedToUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg ansatt" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u: any) => u.id !== currentUser?.id && u.teamId === selectedTeamId)
                    .map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
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

