"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, CalendarDays, List, RefreshCw, Settings, CalendarCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { UserMenu } from '../auth/UserMenu'
import { NotificationsPanel } from './NotificationsPanel'
import { cn } from '../../lib/utils'

const baseNavItems = [
  { href: '/standard', label: 'Standard plan', icon: Calendar },
  { href: '/month', label: 'Måned', icon: CalendarDays },
  { href: '/agenda', label: 'Agenda', icon: List },
  { href: '/swap', label: 'Vaktbytter', icon: RefreshCw },
  { href: '/holiday-requests', label: 'Fravær', icon: CalendarCheck },
] as const

/**
 * Primary top navigation. The settings entry uses a unified label
 * ("Innstillinger") for every role; only the destination differs — admins
 * and leaders land on the wider /admin hub which embeds their profile,
 * everyone else lands on /settings with their profile and personal options.
 */
export function Navigation() {
  const pathname = usePathname()
  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('failed to load user')
      return res.json() as Promise<{ role: 'ADMIN' | 'LEADER' | 'EMPLOYEE' }>
    },
  })

  const isAdminOrLeader = me?.role === 'ADMIN' || me?.role === 'LEADER'
  const settingsHref = isAdminOrLeader ? '/admin' : '/settings'
  const settingsItem = { href: settingsHref, label: 'Innstillinger', icon: Settings }

  const navItems = [...baseNavItems, settingsItem]

  return (
    <nav className="border-b border-border bg-card">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            )
          })}
        </div>
        <div className="flex items-center gap-4">
          <NotificationsPanel />
          <UserMenu />
        </div>
      </div>
    </nav>
  )
}
