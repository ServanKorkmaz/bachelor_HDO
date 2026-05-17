import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/audit')>('@/lib/auth/audit')
  return { ...actual, logAuthEvent: vi.fn().mockResolvedValue(undefined) }
})

import { GET, POST } from '@/app/api/auth/logout/route'
import { logAuthEvent, AUTH_EVENT } from '@/lib/auth/audit'
import { sealSession, sessionCookieName } from '@/lib/auth/session'

beforeEach(() => { vi.clearAllMocks(); process.env.NODE_ENV = 'test' })

describe('logout', () => {
  it('GET returns 405', async () => {
    const res = await GET()
    expect(res.status).toBe(405)
  })

  it('POST with valid session destroys cookie, audits LOGOUT, redirects to /login', async () => {
    const sealed = await sealSession({ userId: 'u1' })
    const req = new Request('http://localhost:4000/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `${sessionCookieName}=${sealed}` },
    })
    const res = await POST(req)
    expect([302, 307]).toContain(res.status)
    expect(res.headers.get('location')).toContain('/login')

    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain(`${sessionCookieName}=;`)
    expect(setCookie.toLowerCase()).toContain('max-age=0')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGOUT, actorUserId: 'u1' }))
  })

  it('POST without session is idempotent (still redirects, no audit)', async () => {
    const req = new Request('http://localhost:4000/api/auth/logout', { method: 'POST' })
    const res = await POST(req)
    expect([302, 307]).toContain(res.status)
    expect(logAuthEvent).not.toHaveBeenCalled()
  })
})
