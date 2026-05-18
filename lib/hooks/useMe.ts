"use client"

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

export type Role = 'ADMIN' | 'LEADER' | 'EMPLOYEE'

export interface Me {
  id: string
  name: string
  email: string
  role: Role
  teamId: string
}

async function fetchMe(): Promise<Me> {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
  if (!res.ok) throw new Error('failed to load current user')
  return res.json()
}

/**
 * Current authenticated user, fetched from /api/auth/me. Shared queryKey
 * ['auth', 'me'] so every consumer hits the same React Query cache. The
 * user identity is stable for the lifetime of a session, so we mark the
 * data as never going stale. Callers that mutate profile fields are
 * responsible for invalidating the cache explicitly.
 */
export function useMe(): UseQueryResult<Me> {
  return useQuery({ queryKey: ['auth', 'me'], queryFn: fetchMe, staleTime: Infinity })
}
