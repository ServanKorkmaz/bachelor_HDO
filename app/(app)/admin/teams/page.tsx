"use client"

import { useState, useEffect } from 'react'
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
import { Plus, Trash2 } from 'lucide-react'

/** Admin page to create and remove teams. */
export default function TeamsPage() {
  const [teams, setTeams] = useState<any[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')

  useEffect(() => {
    fetchTeams()
  }, [])

  const fetchTeams = () => {
    fetch('/api/teams')
      .then(res => res.json())
      .then(data => setTeams(data))
      .catch(console.error)
  }

  const handleCreate = async () => {
    if (!newTeamName.trim()) return

    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName }),
      })

      if (response.ok) {
        setIsCreateModalOpen(false)
        setNewTeamName('')
        fetchTeams()
      } else {
        alert('Kunne ikke opprette team')
      }
    } catch (error) {
      console.error('Error creating team:', error)
      alert('Kunne ikke opprette team')
    }
  }

  const handleDelete = async (teamId: string) => {
    if (!confirm('Er du sikker på at du vil slette dette teamet?')) return

    try {
      const response = await fetch(`/api/teams/${teamId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchTeams()
      } else {
        alert('Kunne ikke slette team')
      }
    } catch (error) {
      console.error('Error deleting team:', error)
      alert('Kunne ikke slette team')
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
            className="p-4 bg-card rounded-lg border flex items-center justify-between"
          >
            <div>
              <div className="font-medium">{team.name}</div>
              <div className="text-sm text-muted-foreground">
                Opprettet {new Date(team.createdAt).toLocaleDateString('no-NO')}
              </div>
            </div>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => handleDelete(team.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

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

