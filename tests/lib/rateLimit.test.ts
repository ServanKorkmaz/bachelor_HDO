import { afterEach, describe, expect, it } from 'vitest'
import {
  checkRateLimit,
  _resetRateLimitForTests,
  applyRateLimit,
} from '@/lib/security/rateLimit'

afterEach(() => _resetRateLimitForTests())

describe('checkRateLimit', () => {
  const config = { routeKey: 'test', limit: 3, windowMs: 60_000 }

  it('allows the first request and decrements the remaining counter', () => {
    const t0 = 1_000_000
    const r = checkRateLimit('user-1', config, t0)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(2)
  })

  it('allows up to the configured limit, then blocks', () => {
    const t0 = 1_000_000
    expect(checkRateLimit('user-1', config, t0).allowed).toBe(true)
    expect(checkRateLimit('user-1', config, t0).allowed).toBe(true)
    expect(checkRateLimit('user-1', config, t0).allowed).toBe(true)

    const blocked = checkRateLimit('user-1', config, t0)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('isolates buckets per identity', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 3; i++) checkRateLimit('user-1', config, t0)
    // user-2 is unaffected by user-1's traffic
    expect(checkRateLimit('user-2', config, t0).allowed).toBe(true)
  })

  it('isolates buckets per route key', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 3; i++) checkRateLimit('user-1', config, t0)
    const otherRoute = { routeKey: 'other', limit: 3, windowMs: 60_000 }
    expect(checkRateLimit('user-1', otherRoute, t0).allowed).toBe(true)
  })

  it('resets the bucket once the window has passed', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 3; i++) checkRateLimit('user-1', config, t0)
    expect(checkRateLimit('user-1', config, t0).allowed).toBe(false)
    // After the window elapses, the bucket starts over
    expect(checkRateLimit('user-1', config, t0 + 60_001).allowed).toBe(true)
  })
})

describe('applyRateLimit', () => {
  const config = { routeKey: 'apply-test', limit: 2, windowMs: 60_000 }

  function makeReq(userId?: string): Request {
    return new Request('http://localhost/', {
      headers: userId ? { 'x-current-user-id': userId } : {},
    })
  }

  it('returns null when under the limit', () => {
    expect(applyRateLimit(makeReq('u1'), config)).toBeNull()
    expect(applyRateLimit(makeReq('u1'), config)).toBeNull()
  })

  it('returns a 429 NextResponse with Retry-After when over the limit', async () => {
    applyRateLimit(makeReq('u2'), config)
    applyRateLimit(makeReq('u2'), config)
    const res = applyRateLimit(makeReq('u2'), config)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    expect(res!.headers.get('Retry-After')).toMatch(/^\d+$/)
    const body = await res!.json()
    expect(body.error).toBe('Too many requests')
  })

  it('falls back to IP when no user header is present', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    })
    expect(applyRateLimit(req, config)).toBeNull()
    expect(applyRateLimit(req, config)).toBeNull()
    expect(applyRateLimit(req, config)!.status).toBe(429)
  })
})
