"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useAuth } from '@/lib/auth/mockAuth'
import { useToast } from '@/components/ui/use-toast'
import { UserPlus, Shield, UserMinus, UserX, Loader2, Plus, Building2 } from 'lucide-react'

type UserRow = {
  id: string
  name: string
  email: string
  status: string
  teams: { teamId: string; teamName: string; role: string; membershipId: string }[]
  primaryTeam: { id: string; name: string } | null
  createdAt: string
  lastLoginAt: string | null
}

const ADMIN_HEADERS = (currentUserId: string) => ({
  'Content-Type': 'application/json',
  'x-current-user-id': currentUserId,
})

/** Admin > Brukere: alt bruker- og tilgangsstyring samlet (legg til, roller, team, aktiver/deaktiver). */
export default function AdminUsersPage() {
  const { currentUser, isAdmin } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<UserRow[]>([])
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const searchParams = useSearchParams()

  useEffect(() => {
    const teamId = searchParams.get('teamId')
    if (teamId) setTeamFilter(teamId)
  }, [searchParams])

  const fetchUsers = useCallback(() => {
    if (!currentUser?.id) return
    setLoading(true)
    const params = new URLSearchParams()
    params.set('currentUserId', currentUser.id)
    if (q.trim()) params.set('q', q.trim())
    if (statusFilter === 'active' || statusFilter === 'inactive') params.set('status', statusFilter)
    if (teamFilter !== 'all') params.set('teamId', teamFilter)
    fetch(`/api/admin/users?${params}`)
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          toast({ title: 'Ikke tilgang', description: 'Kun admin kan se denne siden.', variant: 'destructive' })
          return []
        }
        return res.json()
      })
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: 'Feil', description: 'Kunne ikke hente brukere', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [currentUser?.id, q, statusFilter, teamFilter, toast])

  const fetchTeams = useCallback(() => {
    fetch('/api/teams')
      .then((res) => res.json())
      .then((data) => setTeams(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const [createDialog, setCreateDialog] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createTeamId, setCreateTeamId] = useState('')
  const [createRole, setCreateRole] = useState<'ADMIN' | 'LEADER' | 'EMPLOYEE'>('EMPLOYEE')
  const [addDialog, setAddDialog] = useState<{ user: UserRow } | null>(null)
  const [addTeamId, setAddTeamId] = useState('')
  const [addRole, setAddRole] = useState<'LEADER' | 'EMPLOYEE'>('EMPLOYEE')
  const [roleDialog, setRoleDialog] = useState<{
    user: UserRow
    membership: { teamId: string; teamName: string; role: string; membershipId: string }
  } | null>(null)
  const [newRole, setNewRole] = useState<'LEADER' | 'EMPLOYEE'>('EMPLOYEE')
  const [removeDialog, setRemoveDialog] = useState<{
    user: UserRow
    membership: { teamId: string; teamName: string; role: string; membershipId: string }
  } | null>(null)
  const [statusDialog, setStatusDialog] = useState<{ user: UserRow; newStatus: 'active' | 'inactive' } | null>(null)
  const [createTeamDialog, setCreateTeamDialog] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedTeam = teamFilter !== 'all' ? teams.find((t) => t.id === teamFilter) : null

  if (!currentUser) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Brukere</h1>
        <p className="text-muted-foreground">Logg inn for å se brukere.</p>
      </div>
    )
  }

  if (!isAdmin()) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Brukere</h1>
        <p className="text-muted-foreground">Kun administratorer har tilgang til denne siden.</p>
      </div>
    )
  }

  const handleCreateUser = async () => {
    if (!currentUser?.id || !createName.trim() || !createEmail.trim() || !createTeamId) {
      toast({ title: 'Fyll ut navn, e-post og team', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: ADMIN_HEADERS(currentUser.id),
        body: JSON.stringify({
          name: createName.trim(),
          email: createEmail.trim().toLowerCase(),
          teamId: createTeamId,
          role: createRole,
          currentUserId: currentUser.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast({ title: 'Bruker opprettet', description: `${createName} er lagt til.` })
        setCreateDialog(false)
        setCreateName('')
        setCreateEmail('')
        setCreateTeamId('')
        setCreateRole('EMPLOYEE')
        fetchUsers()
      } else {
        toast({ title: 'Feil', description: data.error || 'Kunne ikke opprette bruker', variant: 'destructive' })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleAddToTeam = async () => {
    if (!addDialog || !addTeamId || !currentUser?.id) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/teams/${addTeamId}/members`, {
        method: 'POST',
        headers: ADMIN_HEADERS(currentUser.id),
        body: JSON.stringify({ userId: addDialog.user.id, role: addRole, currentUserId: currentUser.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast({ title: 'Lagt til', description: `${addDialog.user.name} er lagt til i teamet.` })
        setAddDialog(null)
        setAddTeamId('')
        fetchUsers()
      } else {
        toast({ title: 'Feil', description: data.error || 'Kunne ikke legge til', variant: 'destructive' })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleChangeRole = async () => {
    if (!roleDialog?.membership.membershipId || !currentUser?.id) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/teams/${roleDialog.membership.teamId}/members/${roleDialog.membership.membershipId}`,
        {
          method: 'PATCH',
          headers: ADMIN_HEADERS(currentUser.id),
          body: JSON.stringify({ role: newRole, currentUserId: currentUser.id }),
        }
      )
      if (res.ok) {
        toast({ title: 'Rolle oppdatert', description: `Rolle satt til ${newRole}.` })
        setRoleDialog(null)
        fetchUsers()
      } else {
        const data = await res.json().catch(() => ({}))
        toast({ title: 'Feil', description: data.error || 'Kunne ikke oppdatere', variant: 'destructive' })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveFromTeam = async () => {
    if (!removeDialog?.membership.membershipId || !currentUser?.id) return
    const teamId = removeDialog.membership.teamId
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/members/${removeDialog.membership.membershipId}`, {
        method: 'DELETE',
        headers: ADMIN_HEADERS(currentUser.id),
      })
      if (res.ok) {
        toast({ title: 'Fjernet fra team', description: `${removeDialog.user.name} er fjernet fra teamet.` })
        setRemoveDialog(null)
        fetchUsers()
      } else {
        const data = await res.json().catch(() => ({}))
        toast({ title: 'Feil', description: data.error || 'Kunne ikke fjerne', variant: 'destructive' })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleStatusChange = async () => {
    if (!statusDialog || !currentUser?.id) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${statusDialog.user.id}`, {
        method: 'PATCH',
        headers: ADMIN_HEADERS(currentUser.id),
        body: JSON.stringify({ status: statusDialog.newStatus, currentUserId: currentUser.id }),
      })
      if (res.ok) {
        toast({
          title: statusDialog.newStatus === 'active' ? 'Aktivert' : 'Deaktivert',
          description: `${statusDialog.user.name} er ${statusDialog.newStatus === 'active' ? 'aktivert' : 'deaktivert'}.`,
        })
        setStatusDialog(null)
        fetchUsers()
      } else {
        const data = await res.json().catch(() => ({}))
        toast({ title: 'Feil', description: data.error || 'Kunne ikke oppdatere', variant: 'destructive' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Brukere</h1>
          <p className="text-sm text-muted-foreground">
            Administrer brukere, team og roller. Legg til brukere, deaktiver eller endre tilgang.
          </p>
        </div>
        <Button onClick={() => setCreateDialog(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Legg til bruker
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <Input
          placeholder="Søk (navn, e-post)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="inactive">Inaktiv</SelectItem>
          </SelectContent>
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle team</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laster brukere…
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          Ingen brukere funnet. Juster filtre eller klikk «Legg til bruker» for å opprette en ny.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="border-b border-border p-3 text-left text-sm font-medium">Navn</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">E-post</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Status</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Team / rolle</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Opprettet</th>
                <th className="border-b border-border p-3 text-left text-sm font-medium">Sist innlogget</th>
                <th className="border-b border-border p-3 text-right text-sm font-medium">Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border">
                  <td className="p-3">{user.name}</td>
                  <td className="p-3">{user.email}</td>
                  <td className="p-3">
                    <span className={user.status === 'active' ? 'text-green-600' : 'text-muted-foreground'}>
                      {user.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {user.teams.map((t) => (
                        <span
                          key={t.teamId}
                          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs"
                        >
                          {t.teamName} ({t.role})
                        </span>
                      ))}
                      {user.teams.length === 0 && (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Legg til i team"
                        onClick={() => setAddDialog({ user })}
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                      {user.teams.map((m) => (
                        <span key={m.teamId} className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Endre rolle"
                            onClick={() => {
                              setRoleDialog({ user, membership: m })
                              setNewRole((m.role as 'LEADER' | 'EMPLOYEE') || 'EMPLOYEE')
                            }}
                          >
                            <Shield className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Fjern fra team"
                            onClick={() => setRemoveDialog({ user, membership: m })}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </span>
                      ))}
                      <Button
                        variant="ghost"
                        size="icon"
                        title={user.status === 'active' ? 'Deaktiver bruker' : 'Aktiver bruker'}
                        onClick={() =>
                          setStatusDialog({
                            user,
                            newStatus: user.status === 'active' ? 'inactive' : 'active',
                          })
                        }
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legg til bruker dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Legg til bruker</DialogTitle>
            <DialogDescription>
              Opprett en ny bruker. Brukeren får tilgang til valgt team med valgt rolle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Navn</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Fullt navn"
              />
            </div>
            <div className="space-y-2">
              <Label>E-post</Label>
              <Input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="epost@eksempel.no"
              />
            </div>
            <div className="space-y-2">
              <Label>Team</Label>
              <Select value={createTeamId} onValueChange={setCreateTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select value={createRole} onValueChange={(v) => setCreateRole(v as 'ADMIN' | 'LEADER' | 'EMPLOYEE')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="LEADER">Leader</SelectItem>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Avbryt</Button>
            <Button onClick={handleCreateUser} disabled={!createName.trim() || !createEmail.trim() || !createTeamId || busy}>
              {busy ? 'Oppretter…' : 'Opprett bruker'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to team dialog */}
      <Dialog open={!!addDialog} onOpenChange={(open) => !open && setAddDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Legg til i team</DialogTitle>
            <DialogDescription>
              Legg {addDialog?.user.name} til i et team. Velg team og rolle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Team</Label>
              <Select value={addTeamId} onValueChange={setAddTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg team" />
                </SelectTrigger>
                <SelectContent>
                  {teams
                    .filter((t) => !addDialog?.user.teams.some((m) => m.teamId === t.id))
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select value={addRole} onValueChange={(v) => setAddRole(v as 'LEADER' | 'EMPLOYEE')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                  <SelectItem value="LEADER">Leader</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(null)}>Avbryt</Button>
            <Button onClick={handleAddToTeam} disabled={!addTeamId || busy}>
              {busy ? 'Legger til…' : 'Legg til'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change role dialog */}
      <Dialog open={!!roleDialog} onOpenChange={(open) => !open && setRoleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Endre rolle</DialogTitle>
            <DialogDescription>
              Endre rolle for {roleDialog?.user.name} i {roleDialog?.membership.teamName}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Rolle</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as 'LEADER' | 'EMPLOYEE')}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EMPLOYEE">Employee</SelectItem>
                <SelectItem value="LEADER">Leader</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)}>Avbryt</Button>
            <Button onClick={handleChangeRole} disabled={busy}>
              {busy ? 'Lagrer…' : 'Lagre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove from team dialog */}
      <Dialog open={!!removeDialog} onOpenChange={(open) => !open && setRemoveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fjern fra team</DialogTitle>
            <DialogDescription>
              Er du sikker på at du vil fjerne {removeDialog?.user.name} fra {removeDialog?.membership.teamName}?
              Brukeren beholdes i systemet, men tilknytningen deaktiveres.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialog(null)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleRemoveFromTeam} disabled={busy}>
              {busy ? 'Fjerner…' : 'Fjern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deaktiver / Aktiver dialog */}
      <Dialog open={!!statusDialog} onOpenChange={(open) => !open && setStatusDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusDialog?.newStatus === 'inactive' ? 'Deaktiver bruker' : 'Aktiver bruker'}
            </DialogTitle>
            <DialogDescription>
              {statusDialog?.newStatus === 'inactive'
                ? `Er du sikker på at du vil deaktivere ${statusDialog?.user.name}? Brukeren kan ikke logge inn, men historiske vakter beholdes (soft delete).`
                : `${statusDialog?.user.name} vil igjen kunne logge inn.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)}>Avbryt</Button>
            <Button
              variant={statusDialog?.newStatus === 'inactive' ? 'destructive' : 'default'}
              onClick={handleStatusChange}
              disabled={busy}
            >
              {busy ? 'Oppdaterer…' : statusDialog?.newStatus === 'inactive' ? 'Deaktiver' : 'Aktiver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
