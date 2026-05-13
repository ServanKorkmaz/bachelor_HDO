import type { RateLimitConfig } from './rateLimit'

const ONE_MINUTE = 60_000

/**
 * Per-route limits. Identity is the authenticated user id when available
 * (falling back to forwarded IP). Numbers are intentionally generous for
 * a single user — they exist to throttle abuse, not legitimate usage.
 */
export const RATE_LIMITS = {
  shiftsBulk: { routeKey: 'shifts.bulk', limit: 5, windowMs: ONE_MINUTE },
  shiftWrite: { routeKey: 'shifts.write', limit: 30, windowMs: ONE_MINUTE },
  notesWrite: { routeKey: 'notes.write', limit: 30, windowMs: ONE_MINUTE },
  notesApprove: { routeKey: 'notes.approve', limit: 30, windowMs: ONE_MINUTE },
  swapWrite: { routeKey: 'swap.write', limit: 30, windowMs: ONE_MINUTE },
  holidayWrite: { routeKey: 'holiday.write', limit: 30, windowMs: ONE_MINUTE },
} satisfies Record<string, RateLimitConfig>
