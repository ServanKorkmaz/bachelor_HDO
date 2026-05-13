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
import { axiosInstance } from '@/lib/axios'

/**
 * Team-wide notification settings. Admin-only — `AdminLayout` redirects
 * non-admins. Personal per-user preferences live at `/settings/notifications`.
 */
export default function AdminNotificationSettingsPage() {
  const queryClient = useQueryClient()
  const [teams, setTeams] = useState<any[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [settings, setSettings] = useState<any>(null)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [smsEndpoint, setSmsEndpoint] = useState('')

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
      <div>
        <h1 className="text-3xl font-bold">Varslingsinnstillinger for team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aktiverer eller deaktiverer e-postvarsler på teamnivå.
          Personlige preferanser ligger under Min konto.
        </p>
      </div>

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
