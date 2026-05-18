import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sessionCookieName, unsealSession } from '@/lib/auth/session'

/**
 * Edge-level auth gate. Verifies the __hdo_session cookie signature with pure
 * crypto (no DB lookup) so it stays Edge-runtime compatible. The wrapper
 * pattern in lib/auth/withAuth.ts remains the source of truth — this is
 * defense-in-depth that rejects unauthenticated requests early.
 */

const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/api/auth/azure/login',
  '/auth/azure/callback',
  '/api/auth/logout',
])

const PUBLIC_PREFIXES = ['/_next', '/favicon', '/assets']

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  const sealed = request.cookies.get(sessionCookieName)?.value
  const session = sealed ? await unsealSession(sealed) : null

  if (session?.userId) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = `?from=${encodeURIComponent(pathname + request.nextUrl.search)}`
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Match everything except Next.js internals and the public folder.
  matcher: ['/((?!_next|favicon|assets).*)'],
}
