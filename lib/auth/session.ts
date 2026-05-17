import { sealData, unsealData } from 'iron-session'

const SESSION_COOKIE_NAME = '__hdo_session'
const SESSION_TTL_SECONDS = 60 * 60 * 8 // 8 hours, rolling

function loadSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET
  if (!secret) {
    throw new Error('SESSION_COOKIE_SECRET environment variable is required')
  }
  if (secret.length < 32) {
    throw new Error('SESSION_COOKIE_SECRET must be at least 32 characters long')
  }
  return secret
}

const SECRET = loadSecret()

export interface SessionData {
  userId: string
}

/** Cookie name; exported so middleware and route handlers stay consistent. */
export const sessionCookieName = SESSION_COOKIE_NAME

/** Cookie options used everywhere we set or clear __hdo_session. */
export function sessionCookieOptions(maxAgeSeconds: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

/** Seal data into a base64url string suitable for a cookie value. */
export async function sealSession(data: SessionData): Promise<string> {
  return sealData(data, { password: SECRET, ttl: SESSION_TTL_SECONDS })
}

/** Unseal a cookie value; returns null on signature mismatch, tampering, or expiry. */
export async function unsealSession(value: string): Promise<SessionData | null> {
  try {
    const data = await unsealData<SessionData>(value, {
      password: SECRET,
      ttl: SESSION_TTL_SECONDS,
    })
    if (!data || typeof data.userId !== 'string') return null
    return data
  } catch {
    return null
  }
}
