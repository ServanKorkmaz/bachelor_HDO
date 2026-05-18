"use client"

import { LogOut } from 'lucide-react'
import { Button } from '../ui/button'
import { useMe, type Role } from '@/lib/hooks/useMe'

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  LEADER: 'Leder',
  EMPLOYEE: 'Ansatt',
}

export function UserMenu() {
  const { data: me, isLoading } = useMe()

  if (isLoading) {
    return <div className="h-9 w-32 animate-pulse rounded bg-muted" aria-hidden />
  }
  if (!me) return null

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-medium text-foreground">{me.name}</span>
        <span className="text-xs text-muted-foreground">{ROLE_LABEL[me.role]}</span>
      </div>
      <form action="/api/auth/logout" method="post">
        <Button type="submit" variant="ghost" size="icon" title="Logg ut">
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Logg ut</span>
        </Button>
      </form>
    </div>
  )
}
