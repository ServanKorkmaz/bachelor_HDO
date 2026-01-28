"use client"

import { useState, useEffect } from 'react'
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

/** Admin page for notification settings per team. */
export default function SettingsPage() {
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [settings, setSettings] = useState<any>(null)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [smsEndpoint, setSmsEndpoint] = useState('')

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
  }, [])

  useEffect(() => {
    if (!selectedTeamId) return

    fetch(`/api/notification-settings?teamId=${selectedTeamId}`)
      .then(res => res.json())
      .then(data => {
        setSettings(data)
        if (data) {
          setEmailEnabled(data.emailEnabled)
          setSmsEndpoint(data.smsEndpoint || '')
        }
      })
      .catch(console.error)
  }, [selectedTeamId])

  const handleSave = async () => {
    if (!selectedTeamId) return

    try {
      const response = await fetch('/api/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeamId,
          emailEnabled,
          smsEndpoint: smsEndpoint || null,
        }),
      })

      if (response.ok) {
        alert('Innstillinger lagret')
      } else {
        alert('Kunne ikke lagre innstillinger')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Kunne ikke lagre innstillinger')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Varslingsinnstillinger</h1>

      <div className="space-y-4 p-4 bg-card rounded-lg border max-w-2xl">
        <div className="space-y-2">
          <Label>Team</Label>
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="Velg team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {settings && (
          <>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="emailEnabled"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="emailEnabled">Aktiver e-postvarsler</Label>
            </div>

            <div className="space-y-2">
              <Label>SMS Endpoint (placeholder)</Label>
              <Input
                value={smsEndpoint}
                onChange={(e) => setSmsEndpoint(e.target.value)}
                placeholder="https://sms-endpoint.example.com/send"
              />
              <p className="text-xs text-muted-foreground">
                Placeholder for fremtidig SMS-integrasjon
              </p>
            </div>

            <Button onClick={handleSave}>Lagre innstillinger</Button>
          </>
        )}
      </div>
    </div>
  )
}

