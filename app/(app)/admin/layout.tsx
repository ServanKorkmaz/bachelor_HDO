"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/mockAuth'

/**
 * Layout wrapper for admin routes. Non-admins are redirected to the standard
 * plan rather than shown a degraded "Kun admin..."-banner — those degraded
 * UIs are misleading and clutter the interface. With this guard in place,
 * everything rendered under `/admin/*` can assume the caller is an admin.
 *
 * Defense in depth: this is a *UX* gate only. The real protection lives in
 * the API wrappers (`withAdmin` in `lib/auth/withAuth.ts`) and the route
 * handlers themselves — those reject non-admin callers regardless of which
 * page they came from.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { currentUser, isAdmin } = useAuth()

  useEffect(() => {
    if (!currentUser) return
    if (!isAdmin()) router.replace('/standard')
  }, [currentUser, isAdmin, router])

  if (!currentUser) {
    return <div className="text-muted-foreground p-8">Laster…</div>
  }

  if (!isAdmin()) {
    // Redirect is in flight. Render nothing rather than flashing the admin UI.
    return null
  }

  return <>{children}</>
}
