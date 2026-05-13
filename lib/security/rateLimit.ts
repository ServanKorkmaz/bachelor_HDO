import { NextResponse } from 'next/server'

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
 * Convenience wrapper for route handlers. Returns a 429 NextResponse if the
 * caller has exceeded the limit, otherwise null. Identifies callers by their
 * authenticated user id when available and falls back to the forwarded IP.
 */
export function applyRateLimit(request: Request, config: RateLimitConfig): NextResponse | null {
  const userId = request.headers.get('x-current-user-id')?.trim()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon'
  const identityKey = userId || ip

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
