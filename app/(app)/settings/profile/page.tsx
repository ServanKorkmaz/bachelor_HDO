"use client"

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth/mockAuth'
import { axiosInstance } from '@/lib/axios'
import { format } from 'date-fns'

/** Profile page showing the current user's information. */
export default function ProfilePage() {
  const { currentUser } = useAuth()

  const { data: userData, isLoading } = useQuery({
    queryKey: ['user', currentUser?.id],
    queryFn: () => axiosInstance.get(`/api/users/${currentUser!.id}`).then(r => r.data),
    enabled: Boolean(currentUser?.id),
  })

  if (isLoading) {
    return <div className="text-muted-foreground">Laster profil...</div>
  }

  const user = userData ?? currentUser

  const roleLabel: Record<string, string> = {
    ADMIN: 'Administrator',
    LEADER: 'Leder',
    EMPLOYEE: 'Ansatt',
  }

  const statusLabel: Record<string, string> = {
    active: 'Aktiv',
    inactive: 'Inaktiv',
  }

  const fields = [
    { label: 'Navn', value: user?.name ?? '—' },
    { label: 'E-post', value: user?.email ?? '—' },
    { label: 'Rolle', value: roleLabel[user?.role] ?? user?.role ?? '—' },
    { label: 'Team', value: user?.team?.name ?? '—' },
    { label: 'Status', value: statusLabel[user?.status] ?? user?.status ?? '—' },
    {
      label: 'Konto opprettet',
      value: user?.createdAt ? format(new Date(user.createdAt), 'dd.MM.yyyy') : '—',
    },
  ]

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-3xl font-bold">Min profil</h1>
      <div className="rounded-lg border bg-card divide-y divide-border">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <span className="text-sm font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
