"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, CalendarDays, List, RefreshCw, Lock, LogOut, CalendarCheck, User } from 'lucide-react'
import { Button } from '../ui/button'
import { RoleSwitcher } from '../auth/RoleSwitcher'
import { NotificationsPanel } from './NotificationsPanel'
import { useAuth } from '@/lib/auth/mockAuth'
import { cn } from '../../lib/utils'

const baseNavItems = [
  { href: '/standard', label: 'Standard plan', icon: Calendar },
  { href: '/month', label: 'Måned', icon: CalendarDays },
  { href: '/agenda', label: 'Agenda', icon: List },
  { href: '/swap', label: 'Vaktbytter', icon: RefreshCw },
  { href: '/holiday-requests', label: 'Fravær', icon: CalendarCheck },
] as const

/**
 * Primary top navigation. The settings entry is role-aware: admins get the
 * full admin hub at `/admin`, everyone else gets their personal settings hub
 * at `/settings`. Non-admins never see admin-only pages in the nav at all.
 */
export function Navigation() {
  const pathname = usePathname()
  const { isAdmin, isLeader } = useAuth()

  const settingsItem = (isAdmin() || isLeader())
    ? { href: '/admin', label: 'Innstillinger', icon: Lock }
    : { href: '/settings', label: 'Min konto', icon: User }

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
          <RoleSwitcher />
          <Button variant="ghost" size="icon" className="hidden sm:flex">
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Logg ut</span>
          </Button>
        </div>
      </div>
    </nav>
  )
}
