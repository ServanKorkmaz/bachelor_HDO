"use client"

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { axiosInstance } from '@/lib/axios'

/** Admin page for notification settings per team and per-user preferences. */
export default function SettingsPage() {
  const { currentUser } = useAuth()
  const queryClient = useQueryClient()
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

  const { data: fetchedTeams = [] } = useQuery<any[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/teams')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  useEffect(() => {
    setTeams(Array.isArray(fetchedTeams) ? fetchedTeams : [])
    if (Array.isArray(fetchedTeams) && fetchedTeams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(fetchedTeams[0].id)
    }
  }, [fetchedTeams, selectedTeamId])

  const { data: teamSettings } = useQuery<any>({
    queryKey: ['notification-settings', selectedTeamId],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/notification-settings?teamId=${selectedTeamId}`)
      return res.data
    },
    enabled: Boolean(selectedTeamId),
  })

  useEffect(() => {
    setSettings(teamSettings ?? null)
    if (teamSettings) {
      setEmailEnabled(teamSettings.emailEnabled)
      setSmsEndpoint(teamSettings.smsEndpoint || '')
    }
  }, [teamSettings])

  const { data: prefData } = useQuery<any>({
    queryKey: ['notification-preferences', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return null
      const res = await axiosInstance.get(`/api/users/${currentUser.id}/notification-preferences`)
      return res.data
    },
    enabled: Boolean(currentUser?.id),
  })

  useEffect(() => {
    if (!prefData) return
    setPrefs({
      shiftChangesEmail: prefData.shiftChangesEmail ?? true,
      shiftChangesSms: prefData.shiftChangesSms ?? false,
      swapEmail: prefData.swapEmail ?? true,
      swapSms: prefData.swapSms ?? false,
      noteEmail: prefData.noteEmail ?? true,
      noteSms: prefData.noteSms ?? false,
    })
  }, [prefData])

  const savePrefsMutation = useMutation({
    mutationFn: async (nextPrefs: any) => {
      if (!currentUser?.id) {
        throw new Error('Not authenticated')
      }
      return axiosInstance.put(`/api/users/${currentUser.id}/notification-preferences`, nextPrefs)
    },
    onSuccess: async () => {
      alert('Varslingspreferanser lagret')
      await queryClient.invalidateQueries({ queryKey: ['notification-preferences', currentUser?.id] })
    },
    onError: () => {
      alert('Kunne ikke lagre varslingspreferanser')
    },
  })

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      return axiosInstance.put('/api/notification-settings', {
        teamId: selectedTeamId,
        emailEnabled,
        smsEndpoint: smsEndpoint || null,
      })
    },
    onSuccess: async () => {
      alert('Innstillinger lagret')
      await queryClient.invalidateQueries({ queryKey: ['notification-settings', selectedTeamId] })
    },
    onError: () => {
      alert('Kunne ikke lagre innstillinger')
    },
  })

  const handleSavePrefs = async () => {
    if (!currentUser?.id || !prefs) return
    setPrefsSaving(true)
    try {
      await savePrefsMutation.mutateAsync(prefs)
    } catch (error) {
      console.error('Error saving notification preferences:', error)
    } finally {
      setPrefsSaving(false)
    }
  }

  const handleSave = async () => {
    if (!selectedTeamId) return

    try {
      await saveSettingsMutation.mutateAsync()
    } catch (error) {
      console.error('Error saving settings:', error)
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

