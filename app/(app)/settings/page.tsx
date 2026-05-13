"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { UserCircle, Bell } from 'lucide-react'
import { useAuth } from '@/lib/auth/mockAuth'

/**
 * Personal settings hub. Admins are forwarded to the admin hub at /admin
 * because that's where their team-wide settings live; everyone else lands
 * here with a small set of personal-only options.
 */
export default function SettingsPage() {
  const router = useRouter()
  const { currentUser, isAdmin } = useAuth()

  useEffect(() => {
    if (!currentUser) return
    if (isAdmin()) router.replace('/admin')
  }, [currentUser, isAdmin, router])

  if (!currentUser) {
    return <div className="text-muted-foreground p-8">Laster…</div>
  }

  if (isAdmin()) {
    return null
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Min konto</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/settings/profile">
          <div className="p-6 bg-card rounded-lg border hover:bg-accent transition-colors cursor-pointer">
            <UserCircle className="h-8 w-8 mb-2" />
            <h2 className="text-lg font-semibold mb-1">Min profil</h2>
            <p className="text-sm text-muted-foreground">Se din brukerinformasjon</p>
          </div>
        </Link>

        <Link href="/settings/notifications">
          <div className="p-6 bg-card rounded-lg border hover:bg-accent transition-colors cursor-pointer">
            <Bell className="h-8 w-8 mb-2" />
            <h2 className="text-lg font-semibold mb-1">Varslinger</h2>
            <p className="text-sm text-muted-foreground">Velg e-post og SMS for vakter, bytter og notater</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
