import { NextResponse } from 'next/server'
import { sessionCookieName, sessionCookieOptions, unsealSession } from '@/lib/auth/session'
import { AUTH_EVENT, logAuthEvent } from '@/lib/auth/audit'

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
}

export async function POST(request: Request): Promise<Response> {
  const sealed = readCookie(request, sessionCookieName)
  if (sealed) {
    const session = await unsealSession(sealed)
    if (session?.userId) {
      await logAuthEvent({ event: AUTH_EVENT.LOGOUT, actorUserId: session.userId })
    }
  }

  const res = NextResponse.redirect(new URL('/login', request.url), 302)
  res.cookies.set(sessionCookieName, '', { ...sessionCookieOptions(), maxAge: 0 })
  return res
}
