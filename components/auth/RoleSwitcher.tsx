"use client"

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth, MockUser } from '@/lib/auth/mockAuth'
import { axiosInstance } from '@/lib/axios'

function initials(name: string): string {
  const parts = name.split(' ').filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/**
 * Identity badge in the top-right nav. While the app is still in mock-auth
 * mode this component also bootstraps the active user by selecting the first
 * row returned from `/api/users` — without that, every request would fail
 * the `x-current-user-id` middleware gate. When auth flips to Microsoft
 * OAuth, the bootstrap effect goes away and the component becomes pure UI.
 *
 * (The role-switch dropdown that used to live here was a development-time
 * affordance and has been removed now that the demo flow is settled.)
 */
export function RoleSwitcher() {
  const { currentUser, setCurrentUser } = useAuth()

  const { data: fetchedUsers = [] } = useQuery<MockUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/users')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  useEffect(() => {
    if (!currentUser && Array.isArray(fetchedUsers) && fetchedUsers.length > 0) {
      setCurrentUser(fetchedUsers[0])
    }
  }, [fetchedUsers, currentUser, setCurrentUser])

  if (!currentUser) return null

  return (
    <div className="flex h-9 items-center gap-2 px-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {initials(currentUser.name)}
      </span>
      <span className="hidden text-sm font-medium sm:inline">
        {currentUser.name}
      </span>
    </div>
  )
}
