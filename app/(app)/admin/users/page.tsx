"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(console.error)

    fetch('/api/teams')
      .then(res => res.json())
      .then(data => setTeams(data))
      .catch(console.error)
  }, [])

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })

      if (response.ok) {
        // Refresh users
        fetch('/api/users')
          .then(res => res.json())
          .then(data => setUsers(data))
          .catch(console.error)
      } else {
        alert('Kunne ikke oppdatere rolle')
      }
    } catch (error) {
      console.error('Error updating user role:', error)
      alert('Kunne ikke oppdatere rolle')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Brukere</h1>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-border p-2 text-left bg-muted">Navn</th>
              <th className="border border-border p-2 text-left bg-muted">Email</th>
              <th className="border border-border p-2 text-left bg-muted">Rolle</th>
              <th className="border border-border p-2 text-left bg-muted">Team</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td className="border border-border p-2">{user.name}</td>
                <td className="border border-border p-2">{user.email}</td>
                <td className="border border-border p-2">
                  <Select
                    value={user.role}
                    onValueChange={(value) => handleRoleChange(user.id, value)}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="LEADER">Leader</SelectItem>
                      <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="border border-border p-2">
                  {teams.find(t => t.id === user.teamId)?.name || 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

