import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/azureAd', () => ({
  exchangeCodeForTokens: vi.fn(),
  expectedTenantId: 'tenant-correct',
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('@/lib/auth/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/audit')>('@/lib/auth/audit')
  return {
    ...actual,
    logAuthEvent: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimit: vi.fn(() => null),
}))

import { GET } from '@/app/api/auth/azure/callback/route'
import { exchangeCodeForTokens } from '@/lib/auth/azureAd'
import { prisma } from '@/lib/prisma'
import { logAuthEvent, AUTH_EVENT } from '@/lib/auth/audit'
import { pkceCookieName, sealPkce } from '@/lib/auth/pkceCookie'
import { sessionCookieName, unsealSession } from '@/lib/auth/session'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'test')
})

async function reqWithPkce(opts: {
  code?: string
  state?: string
  pkceState?: { verifier: string; state: string; from: string } | null
}): Promise<Request> {
  const params = new URLSearchParams()
  if (opts.code) params.set('code', opts.code)
  if (opts.state) params.set('state', opts.state)
  const headers: Record<string, string> = {}
  if (opts.pkceState !== null) {
    const sealed = await sealPkce(opts.pkceState ?? { verifier: 'v'.repeat(64), state: 'S', from: '/' })
    headers['cookie'] = `${pkceCookieName}=${sealed}`
  }
  return new Request(`http://localhost:4000/api/auth/azure/callback?${params.toString()}`, { headers })
}

function redirectsTo(res: Response, fragment: string) {
  expect([302, 307]).toContain(res.status)
  expect(res.headers.get('location')).toContain(fragment)
}

describe('GET /api/auth/azure/callback', () => {
  it('redirects to /login?error=expired when pkce cookie is missing', async () => {
    const res = await GET(await reqWithPkce({ code: 'c', state: 'S', pkceState: null }))
    redirectsTo(res, '/login?error=expired')
  })

  it('redirects to /login?error=invalid + audits LOGIN_STATE_MISMATCH on state mismatch', async () => {
    const req = await reqWithPkce({ code: 'c', state: 'X', pkceState: { verifier: 'v', state: 'S', from: '/' } })
    const res = await GET(req)
    redirectsTo(res, '/login?error=invalid')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_STATE_MISMATCH }))
  })

  it('redirects to /login?error=failed when token exchange throws', async () => {
    ;(exchangeCodeForTokens as any).mockRejectedValueOnce(new Error('msal boom'))
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    const res = await GET(req)
    redirectsTo(res, '/login?error=failed')
  })

  it('redirects to /login?error=tenant + audits LOGIN_WRONG_TENANT when tid mismatches', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-wrong', email: 'x@y.no', preferred_username: 'x@y.no' },
    })
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    const res = await GET(req)
    redirectsTo(res, '/login?error=tenant')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_WRONG_TENANT }))
  })

  it('redirects to /login?error=unknown_user + audits LOGIN_UNKNOWN_USER when no DB match', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'unknown@hdo.no', preferred_username: 'unknown@hdo.no' },
    })
    ;(prisma.user.findUnique as any).mockResolvedValue(null) // both lookups
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    const res = await GET(req)
    redirectsTo(res, '/login?error=unknown_user')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_UNKNOWN_USER }))
  })

  it('writes azureOid when matching by email on first login', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'kari@hdo.no', preferred_username: 'kari@hdo.no' },
    })
    ;(prisma.user.findUnique as any)
      .mockResolvedValueOnce(null) // by azureOid
      .mockResolvedValueOnce({ id: 'u1', email: 'kari@hdo.no', status: 'active', azureOid: null })
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    await GET(req)
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ azureOid: 'o1' }),
    }))
  })

  it('redirects to /login?error=inactive + audits LOGIN_INACTIVE_USER when user.status=inactive', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'kari@hdo.no', preferred_username: 'kari@hdo.no' },
    })
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({ id: 'u1', email: 'kari@hdo.no', status: 'inactive', azureOid: 'o1' })
    const req = await reqWithPkce({ code: 'c', state: 'S' })
    const res = await GET(req)
    redirectsTo(res, '/login?error=inactive')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_INACTIVE_USER }))
  })

  it('happy path: sets __hdo_session, updates lastLoginAt, audits LOGIN_SUCCESS, redirects to from', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'kari@hdo.no', preferred_username: 'kari@hdo.no' },
    })
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({ id: 'u1', email: 'kari@hdo.no', status: 'active', azureOid: 'o1' })

    const req = await reqWithPkce({ code: 'c', state: 'S', pkceState: { verifier: 'v', state: 'S', from: '/standard' } })
    const res = await GET(req)

    redirectsTo(res, '/standard')
    expect(logAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ event: AUTH_EVENT.LOGIN_SUCCESS, actorUserId: 'u1' }))
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
    }))

    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain(sessionCookieName + '=')
    // Also clears pkce cookie:
    expect(setCookie.toLowerCase()).toContain('__hdo_pkce=;')

    // The sealed session value round-trips back to userId u1:
    const match = setCookie.match(new RegExp(`${sessionCookieName}=([^;]+)`))
    expect(match).not.toBeNull()
    const sealed = decodeURIComponent(match![1])
    const session = await unsealSession(sealed)
    expect(session).toEqual({ userId: 'u1' })
  })

  it('falls back to / when the from in pkce state is unsafe', async () => {
    ;(exchangeCodeForTokens as any).mockResolvedValueOnce({
      idTokenClaims: { oid: 'o1', tid: 'tenant-correct', email: 'k@hdo.no', preferred_username: 'k@hdo.no' },
    })
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({ id: 'u1', email: 'k@hdo.no', status: 'active', azureOid: 'o1' })
    const req = await reqWithPkce({ code: 'c', state: 'S', pkceState: { verifier: 'v', state: 'S', from: '//evil.com' } })
    const res = await GET(req)
    redirectsTo(res, '/')
    expect(res.headers.get('location')).not.toContain('evil.com')
  })
})
