import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { exchangeCodeForTokens, expectedTenantId } from '@/lib/auth/azureAd'
import { pkceCookieName, unsealPkce, pkceCookieOptions } from '@/lib/auth/pkceCookie'
import { sessionCookieName, sealSession, sessionCookieOptions } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { AUTH_EVENT, logAuthEvent } from '@/lib/auth/audit'
import { safeFromOrDefault } from '@/lib/auth/safeRedirect'
import { applyRateLimit } from '@/lib/security/rateLimit'

function redirectToLogin(req: Request, errorCode: string): NextResponse {
  const url = new URL('/login', req.url)
  url.searchParams.set('error', errorCode)
  const res = NextResponse.redirect(url, 302)
  // Always clear the pkce cookie when leaving the callback, even on error.
  res.cookies.set(pkceCookieName, '', { ...pkceCookieOptions(), maxAge: 0 })
  return res
}

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function readCookieValue(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export async function GET(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, { routeKey: 'auth.callback', limit: 20, windowMs: 60_000 })
  if (limited) return limited

  const url = new URL(request.url)
  const code = url.searchParams.get('code') ?? ''
  const stateParam = url.searchParams.get('state') ?? ''

  // 1. PKCE cookie
  const sealedPkce = readCookieValue(request, pkceCookieName)
  const pkce = sealedPkce ? await unsealPkce(sealedPkce) : null
  if (!pkce) {
    return redirectToLogin(request, 'expired')
  }

  // 2. State match
  if (!stateParam || !constantTimeEqual(stateParam, pkce.state)) {
    await logAuthEvent({ event: AUTH_EVENT.LOGIN_STATE_MISMATCH })
    return redirectToLogin(request, 'invalid')
  }

  // 3. Token exchange
  let tokens
  try {
    tokens = await exchangeCodeForTokens({ code, codeVerifier: pkce.verifier })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth.callback] token exchange failed', err)
    return redirectToLogin(request, 'failed')
  }
  const claims = tokens.idTokenClaims as
    | { oid?: string; tid?: string; email?: string; preferred_username?: string; name?: string }
    | undefined
  if (!claims) return redirectToLogin(request, 'failed')

  // 4. Tenant check
  if (claims.tid !== expectedTenantId) {
    await logAuthEvent({
      event: AUTH_EVENT.LOGIN_WRONG_TENANT,
      details: { got: claims.tid, expected: expectedTenantId },
    })
    return redirectToLogin(request, 'tenant')
  }

  const oid = claims.oid
  const email = (claims.email ?? claims.preferred_username ?? '').toLowerCase().trim()
  if (!oid || !email) {
    return redirectToLogin(request, 'failed')
  }

  // 5. Lookup user (azureOid first, then email)
  let user = await prisma.user.findUnique({ where: { azureOid: oid } })
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email } })
    if (byEmail) {
      // First login: persist azureOid for future stable matching.
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { azureOid: oid },
      })
      user = { ...byEmail, azureOid: oid }
    }
  }
  if (!user) {
    await logAuthEvent({
      event: AUTH_EVENT.LOGIN_UNKNOWN_USER,
      details: { email, oid },
    })
    return redirectToLogin(request, 'unknown_user')
  }

  // 6. Status check
  if (user.status !== 'active') {
    await logAuthEvent({ event: AUTH_EVENT.LOGIN_INACTIVE_USER, actorUserId: user.id })
    return redirectToLogin(request, 'inactive')
  }

  // 7. Last-login + audit
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await logAuthEvent({ event: AUTH_EVENT.LOGIN_SUCCESS, actorUserId: user.id })

  // 8. Mint session + clear pkce + redirect
  const sealed = await sealSession({ userId: user.id })
  const destination = safeFromOrDefault(pkce.from)
  const res = NextResponse.redirect(new URL(destination, request.url), 302)
  res.cookies.set(sessionCookieName, sealed, sessionCookieOptions())
  res.cookies.set(pkceCookieName, '', { ...pkceCookieOptions(), maxAge: 0 })
  return res
}
