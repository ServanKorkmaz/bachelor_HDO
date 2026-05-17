import { describe, it, expect, beforeEach, vi } from 'vitest'

const SECRET = 'a'.repeat(32)

async function load() {
  vi.resetModules()
  process.env.SESSION_COOKIE_SECRET = SECRET
  return import('@/lib/auth/getCurrentUserId')
}

function reqWithCookie(cookieHeader: string, headers: Record<string, string> = {}): Request {
  return new Request('http://x/y', { headers: { cookie: cookieHeader, ...headers } })
}

describe('getCurrentUserId', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('returns the userId from a valid session cookie', async () => {
    const { getCurrentUserId } = await load()
    const { sealSession, sessionCookieName } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-42' })
    const req = reqWithCookie(`${sessionCookieName}=${sealed}`)
    expect(await getCurrentUserId(req)).toBe('user-42')
  })

  it('returns the x-current-user-id header when NODE_ENV=test and no cookie', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const { getCurrentUserId } = await load()
    const req = new Request('http://x/y', { headers: { 'x-current-user-id': 'user-7' } })
    expect(await getCurrentUserId(req)).toBe('user-7')
  })

  it('IGNORES the x-current-user-id header in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { getCurrentUserId } = await load()
    const req = new Request('http://x/y', { headers: { 'x-current-user-id': 'user-7' } })
    expect(await getCurrentUserId(req)).toBeNull()
  })

  it('returns null when neither cookie nor (test) header present', async () => {
    const { getCurrentUserId } = await load()
    const req = new Request('http://x/y')
    expect(await getCurrentUserId(req)).toBeNull()
  })

  it('returns null for a tampered session cookie', async () => {
    const { getCurrentUserId } = await load()
    const { sealSession, sessionCookieName } = await import('@/lib/auth/session')
    const sealed = await sealSession({ userId: 'user-1' })
    const tampered = sealed.slice(0, -2) + 'xx'
    const req = reqWithCookie(`${sessionCookieName}=${tampered}`)
    expect(await getCurrentUserId(req)).toBeNull()
  })
})
