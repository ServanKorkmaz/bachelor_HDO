"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/mockAuth'

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
  const { currentUser, isAdmin, isLeader } = useAuth()
  const canAccess = () => isAdmin() || isLeader()

  useEffect(() => {
    if (!currentUser) return
    if (!canAccess()) router.replace('/standard')
  }, [currentUser, isAdmin, isLeader, router])

  if (!currentUser) {
    return <div className="text-muted-foreground p-8">Laster…</div>
  }

  if (!canAccess()) {
    return null
  }

  return <>{children}</>
}
