"use client"

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { axiosInstance } from '@/lib/axios'
import { useMe } from '@/lib/hooks/useMe'

interface Prefs {
  shiftChangesEmail: boolean
  shiftChangesSms: boolean
  swapEmail: boolean
  swapSms: boolean
  noteEmail: boolean
  noteSms: boolean
}

/**
 * Personal notification preferences. Lives under `/settings/*` rather than
 * `/admin/*` because every user. Admin, leader, employee. Manages their
 * own preferences. The corresponding admin-only **team** notification
 * settings live at `/admin/settings`.
 */
export default function NotificationPreferencesPage() {
  const { data: me } = useMe()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: prefData } = useQuery<Prefs | null>({
    queryKey: ['notification-preferences', me?.id],
    queryFn: async () => {
      if (!me?.id) return null
      const res = await axiosInstance.get(`/api/users/${me.id}/notification-preferences`)
      return res.data
    },
    enabled: Boolean(me?.id),
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

  const saveMutation = useMutation({
    mutationFn: async (next: Prefs) => {
      if (!me?.id) throw new Error('Not authenticated')
      return axiosInstance.put(`/api/users/${me.id}/notification-preferences`, next)
    },
    onSuccess: async () => {
      toast({ title: 'Varslingspreferanser lagret' })
      await queryClient.invalidateQueries({ queryKey: ['notification-preferences', me?.id] })
    },
    onError: () => {
      toast({ title: 'Feil', description: 'Kunne ikke lagre varslingspreferanser', variant: 'destructive' })
    },
  })

  const handleSave = async () => {
    if (!me?.id || !prefs) return
    setSaving(true)
    try {
      await saveMutation.mutateAsync(prefs)
    } finally {
      setSaving(false)
    }
  }

  if (!me) {
    return <div className="text-muted-foreground">Logg inn for å redigere varslingspreferanser.</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Mine varslingspreferanser</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Velg hvilke varsler du vil motta og om du vil ha dem på e-post, SMS eller begge.
        </p>
      </div>

      <div className="space-y-4 p-4 bg-card rounded-lg border max-w-2xl">
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Lagrer…' : 'Lagre varslingspreferanser'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
