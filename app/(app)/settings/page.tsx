"use client"

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ProfileSection } from '@/components/auth/ProfileSection'

/**
 * Personal settings page for everyone. Shows the user's profile inline and
 * the (single) personal-setting they can edit: notification preferences.
 * Admins land on /admin via the nav for the wider admin tooling — but if
 * they explicitly visit /settings, they see this same personal view rather
 * than getting redirected away.
 */
export default function SettingsPage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('failed to load user')
      return res.json() as Promise<{ id: string; name: string; email: string; role: 'ADMIN' | 'LEADER' | 'EMPLOYEE'; teamId: string }>
    },
  })

  if (isLoading || !me) {
    return <div className="text-muted-foreground p-8">Laster…</div>
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold">Innstillinger</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Din profil og personlige innstillinger.
        </p>
      </header>

      <ProfileSection />

      <section className="space-y-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Varslinger
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Hvordan du vil bli varslet om endringer.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/settings/notifications"
            className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-accent/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
              <Bell className="h-4 w-4" />
            </span>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold leading-tight">Varslinger</h3>
              <p className="text-xs leading-snug text-muted-foreground">
                Velg e-post og SMS for vakter, bytter og notater.
              </p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  )
}
