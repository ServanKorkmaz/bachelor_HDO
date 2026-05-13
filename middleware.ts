import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Edge-level auth gate. The wrapper pattern in `lib/auth/withAuth.ts` is the
 * source of truth — this middleware is a defense-in-depth net that rejects
 * obviously-unauthenticated requests before they reach a route handler at
 * all. Doing the DB-backed role/team checks here would force us into the
 * Edge Runtime + Prisma compatibility story; we deliberately keep middleware
 * dependency-free.
 *
 * Mock phase: presence of `x-current-user-id`.
 * Production phase (passport-microsoft): presence of the signed session
 * cookie set by the Microsoft OAuth callback handler. Only this file changes
 * when auth flips over — see SECURITY.md "Migration to passport-microsoft".
 */

/**
 * Routes that intentionally do not require auth in the mock phase. Anything
 * not on this list and not in the public asset paths must carry a session
 * marker.
 */
const PUBLIC_API_ROUTES = new Set<string>([
  // `RoleSwitcher` bootstraps from this list on first load before any user is
  // selected. In production this endpoint disappears in favour of the Azure
  // AD directory and the exception goes away.
  '/api/users',
])

function isPublic(pathname: string): boolean {
  return PUBLIC_API_ROUTES.has(pathname)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  const sessionMarker = request.headers.get('x-current-user-id')?.trim()
  if (!sessionMarker) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
