"use client"

import { useState } from 'react'
import Link from 'next/link'
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
import { Plus, Trash2, Users } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth/mockAuth'
import { useToast } from '@/components/ui/use-toast'
import { axiosInstance } from '@/lib/axios'

/**
 * Admin page to create and remove teams.
 *
 * Reachable only when the parent `AdminLayout` has confirmed the caller is
 * an admin; non-admin role checks below are therefore not needed for UX.
 * The API still enforces them — see `withAdmin` on POST/DELETE /api/teams.
 */
export default function TeamsPage() {
  const { currentUser } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; teamId: string; teamName: string }>({ open: false, teamId: '', teamName: '' })

  const { data: teams = [] } = useQuery<any[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/teams')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const handleCreate = async () => {
    if (!newTeamName.trim() || !currentUser) return
    try {
      await axiosInstance.post('/api/teams', { name: newTeamName, currentUserId: currentUser.id })
      setIsCreateModalOpen(false)
      setNewTeamName('')
      await queryClient.invalidateQueries({ queryKey: ['teams'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    } catch {
      toast({ title: 'Feil', description: 'Kunne ikke opprette team', variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    if (!currentUser) return
    try {
      await axiosInstance.delete(`/api/teams/${deleteDialog.teamId}`, { data: { currentUserId: currentUser.id } })
      await queryClient.invalidateQueries({ queryKey: ['teams'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    } catch {
      toast({ title: 'Feil', description: 'Kunne ikke slette team', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Team</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nytt team
        </Button>
      </div>

      <div className="space-y-2">
        {teams.map(team => (
          <div
            key={team.id}
            className="p-4 bg-card rounded-lg border flex items-center justify-between gap-4"
          >
            <div>
              <div className="font-medium">{team.name}</div>
              <div className="text-sm text-muted-foreground">
                Opprettet {new Date(team.createdAt).toLocaleDateString('no-NO')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/users?teamId=${team.id}`}>
                  <Users className="h-4 w-4 mr-2" />
                  Se ansatte
                </Link>
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setDeleteDialog({ open: true, teamId: team.id, teamName: team.name })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog(d => ({ ...d, open: false }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slett team</DialogTitle>
            <DialogDescription>
              Er du sikker på at du vil slette <strong>{deleteDialog.teamName}</strong>? Dette kan ikke angres.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(d => ({ ...d, open: false }))}>Avbryt</Button>
            <Button variant="destructive" onClick={async () => { setDeleteDialog(d => ({ ...d, open: false })); await handleDelete() }}>Slett</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opprett nytt team</DialogTitle>
            <DialogDescription>
              Legg til et nytt team i systemet
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Navn</Label>
              <Input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Team navn"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleCreate} disabled={!newTeamName.trim()}>
              Opprett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
