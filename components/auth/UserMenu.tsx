"use client"

import { useQuery } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { Button } from '../ui/button'

interface Me {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'LEADER' | 'EMPLOYEE'
  teamId: string
}

const ROLE_LABEL: Record<Me['role'], string> = {
  ADMIN: 'Admin',
  LEADER: 'Leder',
  EMPLOYEE: 'Ansatt',
}

async function fetchMe(): Promise<Me> {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
  if (!res.ok) throw new Error('failed to load user')
  return res.json()
}

export function UserMenu() {
  const { data: me, isLoading } = useQuery({ queryKey: ['auth', 'me'], queryFn: fetchMe })

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
