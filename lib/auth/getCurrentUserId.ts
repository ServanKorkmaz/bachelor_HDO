import { sessionCookieName, unsealSession } from './session'

/**
 * Resolve the calling user's id. Production reads a signed iron-session cookie.
 * In NODE_ENV=test, falls back to the legacy `x-current-user-id` header so the
 * existing route-handler test suite continues to work without churn. The
 * fallback is structurally closed in production.
 */
export async function getCurrentUserId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const sealed = readCookie(cookieHeader, sessionCookieName)
  if (sealed) {
    const session = await unsealSession(sealed)
    if (session?.userId) return session.userId
  }

  if (process.env.NODE_ENV === 'test') {
    return request.headers.get('x-current-user-id')?.trim() || null
  }

  return null
}

function readCookie(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}
