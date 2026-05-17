"use client"

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { axiosInstance } from '@/lib/axios'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  LEADER: 'Leder',
  EMPLOYEE: 'Ansatt',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktiv',
  inactive: 'Inaktiv',
}

/**
 * Inline "Profil" block used at the top of both /settings (employees) and
 * /admin (admins/leaders). Fetches `/api/users/{id}` so the row matches what
 * the server has — `MockUser` in the auth store only carries the fields the
 * client needs for role gating, not full account metadata.
 */
export function ProfileSection() {
  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('failed to load user')
      return res.json() as Promise<{ id: string; name: string; email: string; role: 'ADMIN' | 'LEADER' | 'EMPLOYEE'; teamId: string }>
    },
  })

  const { data: userData, isLoading } = useQuery({
    queryKey: ['user', me?.id],
    queryFn: () => axiosInstance.get(`/api/users/${me!.id}`).then((r) => r.data),
    enabled: Boolean(me?.id),
  })

  if (!me) return null

  const user = userData ?? me
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Navn', value: user?.name ?? '—' },
    { label: 'E-post', value: user?.email ?? '—' },
    { label: 'Rolle', value: ROLE_LABEL[user?.role] ?? user?.role ?? '—' },
    { label: 'Team', value: user?.team?.name ?? '—' },
    { label: 'Status', value: STATUS_LABEL[user?.status] ?? user?.status ?? '—' },
    {
      label: 'Konto opprettet',
      value: user?.createdAt ? format(new Date(user.createdAt), 'dd.MM.yyyy') : '—',
    },
  ]

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Profil
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Slik er du registrert i systemet.
        </p>
      </div>
      <div className="max-w-2xl divide-y divide-border rounded-lg border bg-card">
        {isLoading && !userData ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Laster profil…</div>
        ) : (
          fields.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="text-sm font-medium">{value}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
