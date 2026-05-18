import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const SECRET = 'a'.repeat(32)

async function loadMw() {
  vi.resetModules()
  process.env.SESSION_COOKIE_SECRET = SECRET
  return import('@/middleware')
}

function makeReq(url: string, cookie?: string): NextRequest {
  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)
  return new NextRequest(new URL(url, 'http://localhost:4000'), { headers })
}

describe('middleware', () => {
  beforeEach(() => { vi.stubEnv('NODE_ENV', 'test') })

  it('allows public paths through without a session', async () => {
    const { middleware } = await loadMw()
    for (const path of ['/login', '/api/auth/azure/login', '/auth/azure/callback', '/api/auth/logout']) {
      const res = await middleware(makeReq(path))
      expect(res.status).toBe(200)
    }
  })

  it('passes through with a valid session cookie', async () => {
    const { sealSession, sessionCookieName } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'u1' })
    const { middleware } = await loadMw()
    const res = await middleware(makeReq('/api/shifts', `${sessionCookieName}=${sealed}`))
    expect(res.status).toBe(200)
  })

  it('returns 401 JSON for unauthenticated /api/* requests', async () => {
    const { middleware } = await loadMw()
    const res = await middleware(makeReq('/api/shifts'))
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
  })

  it('redirects unauthenticated page requests to /login?from=…', async () => {
    const { middleware } = await loadMw()
    const res = await middleware(makeReq('/standard'))
    expect(res.status).toBe(307) // Next.js redirect uses 307 by default
    const loc = res.headers.get('location')!
    expect(loc).toContain('/login')
    expect(loc).toContain('from=%2Fstandard')
  })

  it('returns 401 for /api/* with a tampered cookie', async () => {
    const { sealSession, sessionCookieName } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'u1' })
    const tampered = sealed.slice(0, -2) + 'xx'
    const { middleware } = await loadMw()
    const res = await middleware(makeReq('/api/shifts', `${sessionCookieName}=${tampered}`))
    expect(res.status).toBe(401)
  })
})
