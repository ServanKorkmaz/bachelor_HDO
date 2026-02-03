import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** Result when admin check succeeds. */
export type AdminAuth = { currentUser: { id: string; role: string } }

/**
 * Require current user to be system Admin (role === 'ADMIN').
 * Reads currentUserId from header x-current-user-id or from JSON body (for POST/PATCH).
 * Returns NextResponse (401/403) on failure; use in route: if (res) return res.
 * On success returns null and populates authResult with { currentUser }.
 */
export async function requireAdmin(
  request: Request,
  authResult: { currentUser?: { id: string; role: string } }
): Promise<NextResponse | null> {
  let currentUserId: string | null =
    request.headers.get('x-current-user-id')?.trim() || null

  if (!currentUserId && request.method === 'GET') {
    const url = new URL(request.url)
    currentUserId = url.searchParams.get('currentUserId')?.trim() || null
  }
  if (!currentUserId) {
    try {
      const body = await request.clone().json().catch(() => ({}))
      currentUserId = (body as { currentUserId?: string })?.currentUserId ?? null
    } catch {
      // no body or not json
    }
  }

  if (!currentUserId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { id: true, role: true },
  })

  if (!currentUser || currentUser.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  authResult.currentUser = currentUser
  return null
}
