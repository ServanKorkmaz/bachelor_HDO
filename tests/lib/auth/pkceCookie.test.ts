import { describe, it, expect, beforeEach } from 'vitest'

const SECRET = 'a'.repeat(32)

describe('lib/auth/pkceCookie', () => {
  beforeEach(() => {
    process.env.SESSION_COOKIE_SECRET = SECRET
  })

  it('round-trips PKCE state through seal and unseal', async () => {
    const { sealPkce, unsealPkce } = await import('@/lib/auth/pkceCookie')
    const state = { verifier: 'v'.repeat(64), state: 's'.repeat(32), from: '/standard' }
    const sealed = await sealPkce(state)
    const opened = await unsealPkce(sealed)
    expect(opened).toEqual(state)
  })

  it('returns null when the cookie is tampered', async () => {
    const { sealPkce, unsealPkce } = await import('@/lib/auth/pkceCookie')
    const sealed = await sealPkce({ verifier: 'v', state: 's', from: '/' })
    const opened = await unsealPkce(sealed.slice(0, -2) + 'xx')
    expect(opened).toBeNull()
  })

  it('exports a cookie name and short max-age (<= 600s)', async () => {
    const { pkceCookieName, pkceCookieOptions } = await import('@/lib/auth/pkceCookie')
    expect(pkceCookieName).toBe('__hdo_pkce')
    expect(pkceCookieOptions().maxAge).toBeLessThanOrEqual(600)
    expect(pkceCookieOptions().httpOnly).toBe(true)
    expect(pkceCookieOptions().sameSite).toBe('lax')
  })
})
