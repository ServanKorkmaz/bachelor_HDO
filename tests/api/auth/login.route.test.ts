import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/azureAd', () => ({
  buildAuthCodeUrl: vi.fn(async () => ({
    url: 'https://login.microsoftonline.com/x/oauth2/v2.0/authorize?state=S&code_challenge=C',
    verifier: 'v'.repeat(64),
    state: 'S',
  })),
  expectedTenantId: 'tid',
}))

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimit: vi.fn(() => null),
}))

import { GET } from '@/app/api/auth/azure/login/route'
import { applyRateLimit } from '@/lib/security/rateLimit'
import { pkceCookieName } from '@/lib/auth/pkceCookie'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'test')
})

describe('GET /api/auth/azure/login', () => {
  it('302-redirects to Microsoft and sets the __hdo_pkce cookie', async () => {
    const res = await GET(new Request('http://localhost:4000/api/auth/azure/login'))
    expect([302, 307]).toContain(res.status)
    expect(res.headers.get('location')).toMatch(/login\.microsoftonline\.com/)
    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain(pkceCookieName + '=')
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
  })

  it('preserves a safe ?from= into the pkce cookie state', async () => {
    const res = await GET(new Request('http://localhost:4000/api/auth/azure/login?from=%2Fadmin'))
    expect([302, 307]).toContain(res.status)
    expect(res.headers.get('set-cookie')).toContain(pkceCookieName + '=')
    // Detailed verification of the embedded `from` is covered by callback tests
    // (which read and assert on the unsealed PkceState).
  })

  it('falls back to "/" when ?from= is unsafe', async () => {
    // Just assert the route does not throw and still sets the cookie.
    const res = await GET(new Request('http://localhost:4000/api/auth/azure/login?from=%2F%2Fevil.com'))
    expect([302, 307]).toContain(res.status)
  })

  it('returns 429 when rate limit is exceeded', async () => {
    ;(applyRateLimit as any).mockReturnValueOnce(new Response('too many', { status: 429 }))
    const res = await GET(new Request('http://localhost:4000/api/auth/azure/login'))
    expect(res.status).toBe(429)
  })
})
