import { NextResponse } from 'next/server'
import { sessionCookieName } from '@/lib/auth/session'

interface Bucket {
  count: number
  resetAt: number
}

// Module-scoped buckets keyed by `${routeKey}:${ip}`. In a serverless
// deployment this resets per cold-start, which is acceptable for the
// abuse-throttling use case (and would be replaced by Upstash/Redis in
// a production deployment with multiple replicas).
const buckets = new Map<string, Bucket>()

export interface RateLimitConfig {
  /** Stable identifier for the route, e.g. "shifts.bulk". */
  routeKey: string
  /** Maximum number of requests allowed in the window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

/** Pure check + increment. Useful for unit tests. */
export function checkRateLimit(
  identityKey: string,
  config: RateLimitConfig,
  now: number = Date.now()
): RateLimitResult {
  const fullKey = `${config.routeKey}:${identityKey}`
  const existing = buckets.get(fullKey)

  if (!existing || existing.resetAt <= now) {
    buckets.set(fullKey, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, retryAfterSeconds: 0, remaining: config.limit - 1 }
  }

  if (existing.count >= config.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    }
  }

  existing.count += 1
  return { allowed: true, retryAfterSeconds: 0, remaining: config.limit - existing.count }
}

/**
 * Stable per-request identifier for rate-limit buckets. Preference order:
 * 1. Sealed session cookie value (stable per logged-in session. Covers the new auth and the test-env header fallback when it produces a cookie).
 * 2. `x-current-user-id` header (test environment only. Vitest route tests).
 * 3. First `x-forwarded-for` IP (unauthenticated callers).
 * 4. Literal `'anon'` (no signal at all).
 *
 * We use the sealed cookie value directly (not the unsealed userId) so this stays
 * synchronous. Unsealing requires async crypto and would propagate `await` into
 * every rate-limited route. The cookie value is a 1:1 mapping to the session, so
 * it's functionally equivalent for rate-limit bucketing.
 */
function identityKeyFor(request: Request): string {
  const cookieHeader = request.headers.get('cookie') ?? ''
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === sessionCookieName) return `s:${rest.join('=')}`
  }

  if (process.env.NODE_ENV === 'test') {
    const headerUser = request.headers.get('x-current-user-id')?.trim()
    if (headerUser) return `u:${headerUser}`
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return ip ? `ip:${ip}` : 'anon'
}

/**
 * Convenience wrapper for route handlers. Returns a 429 NextResponse if the
 * caller has exceeded the limit, otherwise null. Identifies callers by their
 * session cookie when available and falls back to the forwarded IP.
 */
export function applyRateLimit(request: Request, config: RateLimitConfig): NextResponse | null {
  const identityKey = identityKeyFor(request)

  const result = checkRateLimit(identityKey, config)
  if (result.allowed) return null

  return NextResponse.json(
    { error: 'Too many requests', retryAfterSeconds: result.retryAfterSeconds },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
      },
    }
  )
}

/** Reset the in-memory state. Test-only; not exported from the package surface. */
export function _resetRateLimitForTests(): void {
  buckets.clear()
}
