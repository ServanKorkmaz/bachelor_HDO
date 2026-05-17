import { prisma } from '@/lib/prisma'

export const AUTH_EVENT = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_UNKNOWN_USER: 'LOGIN_UNKNOWN_USER',
  LOGIN_INACTIVE_USER: 'LOGIN_INACTIVE_USER',
  LOGIN_STATE_MISMATCH: 'LOGIN_STATE_MISMATCH',
  LOGIN_WRONG_TENANT: 'LOGIN_WRONG_TENANT',
  LOGOUT: 'LOGOUT',
} as const

export type AuthEvent = (typeof AUTH_EVENT)[keyof typeof AUTH_EVENT]

const SENSITIVE_KEY_PATTERN = /token|secret|password|code/i

/** Drop keys whose name matches sensitive patterns. Shallow. */
export function scrubDetails(
  details: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!details) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(details)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) continue
    out[k] = v
  }
  return out
}

export interface LogAuthEventInput {
  event: AuthEvent
  /** Real user id when known; falls back to 'anonymous' sentinel when not. */
  actorUserId?: string
  /** Free-form context (tenant id, email attempted, etc.). Run through scrubber. */
  details?: Record<string, unknown>
}

/**
 * Best-effort audit write for auth events. Never throws — auth flow must not
 * be blocked by an audit failure, and the real error must surface instead.
 */
export async function logAuthEvent(input: LogAuthEventInput): Promise<void> {
  try {
    const scrubbed = scrubDetails(input.details)
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? 'anonymous',
        action: input.event,
        entityType: 'auth',
        entityId: input.actorUserId ?? 'anonymous',
        afterJson: scrubbed ? JSON.stringify(scrubbed) : null,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth.audit] failed to write audit log', err)
  }
}
