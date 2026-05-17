"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

/**
 * Layout wrapper for admin routes. Users without admin or leader access are
 * redirected to the standard plan — degraded "access denied" banners are
 * misleading and clutter the interface. With this guard in place, everything
 * rendered under `/admin/*` can assume the caller is an admin or leader.
 *
 * Defense in depth: this is a *UX* gate only. The real protection lives in
 * the API wrappers (`withLeaderOrAdmin` in `lib/auth/withAuth.ts`) and the
 * route handlers themselves — those reject unauthorized callers regardless of
 * which page they came from.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { data: me, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('failed to load user')
      return res.json() as Promise<{ id: string; name: string; email: string; role: 'ADMIN' | 'LEADER' | 'EMPLOYEE'; teamId: string }>
    },
  })

  const canAccess = me?.role === 'ADMIN' || me?.role === 'LEADER'

  useEffect(() => {
    if (isLoading) return
    if (me && !canAccess) router.replace('/standard')
  }, [me, isLoading, canAccess, router])

  if (isLoading || !me) {
    return <div className="text-muted-foreground p-8">Laster…</div>
  }

  if (!canAccess) {
    return null
  }

  return <>{children}</>
}
