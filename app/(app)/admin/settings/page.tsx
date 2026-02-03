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
import { useAuth } from '@/lib/auth/mockAuth'

/** Admin page for notification settings per team and per-user preferences. */
export default function SettingsPage() {
  const { currentUser } = useAuth()
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [settings, setSettings] = useState<any>(null)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [smsEndpoint, setSmsEndpoint] = useState('')

  const [prefs, setPrefs] = useState<{
    shiftChangesEmail: boolean
    shiftChangesSms: boolean
    swapEmail: boolean
    swapSms: boolean
    noteEmail: boolean
    noteSms: boolean
  } | null>(null)
  const [prefsSaving, setPrefsSaving] = useState(false)

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

  useEffect(() => {
    if (!currentUser?.id) return
    fetch(`/api/users/${currentUser.id}/notification-preferences`)
      .then(res => res.json())
      .then(data => {
        setPrefs({
          shiftChangesEmail: data.shiftChangesEmail ?? true,
          shiftChangesSms: data.shiftChangesSms ?? false,
          swapEmail: data.swapEmail ?? true,
          swapSms: data.swapSms ?? false,
          noteEmail: data.noteEmail ?? true,
          noteSms: data.noteSms ?? false,
        })
      })
      .catch(console.error)
  }, [currentUser?.id])

  const handleSavePrefs = async () => {
    if (!currentUser?.id || !prefs) return
    setPrefsSaving(true)
    try {
      const response = await fetch(`/api/users/${currentUser.id}/notification-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })
      if (response.ok) {
        alert('Varslingspreferanser lagret')
      } else {
        alert('Kunne ikke lagre varslingspreferanser')
      }
    } catch (error) {
      console.error('Error saving notification preferences:', error)
      alert('Kunne ikke lagre varslingspreferanser')
    } finally {
      setPrefsSaving(false)
    }
  }

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

      {currentUser && (
        <div className="space-y-4 p-4 bg-card rounded-lg border max-w-2xl">
          <h2 className="text-xl font-semibold">Mine varslingspreferanser</h2>
          <p className="text-sm text-muted-foreground">
            Velg hvilke varsler du vil motta og om du vil ha dem på e-post, SMS eller begge.
          </p>
          {prefs && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label className="text-base">Vaktendringer</Label>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prefs.shiftChangesEmail}
                      onChange={e => setPrefs({ ...prefs, shiftChangesEmail: e.target.checked })}
                      className="rounded"
                    />
                    <span>E-post</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prefs.shiftChangesSms}
                      onChange={e => setPrefs({ ...prefs, shiftChangesSms: e.target.checked })}
                      className="rounded"
                    />
                    <span>SMS</span>
                  </label>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-base">Vaktbytter</Label>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prefs.swapEmail}
                      onChange={e => setPrefs({ ...prefs, swapEmail: e.target.checked })}
                      className="rounded"
                    />
                    <span>E-post</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prefs.swapSms}
                      onChange={e => setPrefs({ ...prefs, swapSms: e.target.checked })}
                      className="rounded"
                    />
                    <span>SMS</span>
                  </label>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-base">Notater (fravær/sykdom)</Label>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prefs.noteEmail}
                      onChange={e => setPrefs({ ...prefs, noteEmail: e.target.checked })}
                      className="rounded"
                    />
                    <span>E-post</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prefs.noteSms}
                      onChange={e => setPrefs({ ...prefs, noteSms: e.target.checked })}
                      className="rounded"
                    />
                    <span>SMS</span>
                  </label>
                </div>
              </div>
              <Button onClick={handleSavePrefs} disabled={prefsSaving}>
                {prefsSaving ? 'Lagrer…' : 'Lagre varslingspreferanser'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

