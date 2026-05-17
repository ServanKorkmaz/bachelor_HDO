import { NextResponse } from 'next/server'
import { buildAuthCodeUrl } from '@/lib/auth/azureAd'
import { pkceCookieName, pkceCookieOptions, sealPkce } from '@/lib/auth/pkceCookie'
import { safeFromOrDefault } from '@/lib/auth/safeRedirect'
import { applyRateLimit } from '@/lib/security/rateLimit'

export async function GET(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, {
    routeKey: 'auth.login',
    limit: 10,
    windowMs: 60_000,
  })
  if (limited) return limited

  const url = new URL(request.url)
  const from = safeFromOrDefault(url.searchParams.get('from'))

  const { url: authUrl, verifier, state } = await buildAuthCodeUrl()
  const pkce = await sealPkce({ verifier, state, from })

  const res = NextResponse.redirect(authUrl, 302)
  res.cookies.set(pkceCookieName, pkce, pkceCookieOptions())
  return res
}
