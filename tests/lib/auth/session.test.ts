import { describe, it, expect, beforeEach, vi } from 'vitest'

const SECRET = 'a'.repeat(32)
const OTHER_SECRET = 'b'.repeat(32)

describe('lib/auth/session', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SESSION_COOKIE_SECRET = SECRET
    process.env.NODE_ENV = 'test'
  })

  it('round-trips a userId through seal and unseal', async () => {
    const { sealSession, unsealSession } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-1' })
    expect(typeof sealed).toBe('string')
    expect(sealed.length).toBeGreaterThan(0)
    const opened = await unsealSession(sealed)
    expect(opened).toEqual({ userId: 'user-1' })
  })

  it('returns null for a cookie sealed with a different secret', async () => {
    const { sealSession } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-1' })

    vi.resetModules()
    process.env.SESSION_COOKIE_SECRET = OTHER_SECRET
    const { unsealSession } = await import('@/lib/auth/session')
    const opened = await unsealSession(sealed)
    expect(opened).toBeNull()
  })

  it('returns null for a tampered cookie value', async () => {
    const { sealSession, unsealSession } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-1' })
    const tampered = sealed.slice(0, -2) + 'xx'
    const opened = await unsealSession(tampered)
    expect(opened).toBeNull()
  })

  it('throws at import-time when SESSION_COOKIE_SECRET is missing', async () => {
    vi.resetModules()
    delete process.env.SESSION_COOKIE_SECRET
    await expect(import('@/lib/auth/session')).rejects.toThrow(/SESSION_COOKIE_SECRET/)
  })

  it('throws at import-time when SESSION_COOKIE_SECRET is too short', async () => {
    vi.resetModules()
    process.env.SESSION_COOKIE_SECRET = 'short'
    await expect(import('@/lib/auth/session')).rejects.toThrow(/at least 32/)
  })
})
