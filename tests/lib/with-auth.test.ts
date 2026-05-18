import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { assertTeamMember, withAdmin, withAuth } from '@/lib/auth/withAuth'

function makeRequest(userId?: string): Request {
  return new Request('http://localhost/api/admin/test', {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

/** Unit tests for the auth wrappers in `lib/auth/withAuth.ts`. */
describe('withAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  const handler = vi.fn(async () => new Response('ok'))
  const wrapped = withAdmin(handler)

  it('returns 401 when currentUserId is missing', async () => {
    handler.mockClear()
    const res = await wrapped(makeRequest())
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 401 when user does not exist in database', async () => {
    handler.mockClear()
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const res = await wrapped(makeRequest('unknown-user'))
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 403 when user is not ADMIN', async () => {
    handler.mockClear()
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'EMPLOYEE' })
    const res = await wrapped(makeRequest('user-1'))
    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('invokes the handler with a typed ctx when user is ADMIN', async () => {
    handler.mockClear()
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' })
    await wrapped(makeRequest('admin-1'))
    expect(handler).toHaveBeenCalledTimes(1)
    const call = handler.mock.calls[0] as unknown as [Request, { userId: string; role: string }]
    expect(call[1].userId).toBe('admin-1')
    expect(call[1].role).toBe('ADMIN')
  })
})

describe('withAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('narrows by allowed roles', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const wrapped = withAuth(handler, { roles: ['ADMIN', 'LEADER'] })

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE' })
    const res = await wrapped(makeRequest('emp-1'))
    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('admits any authenticated user when no role filter is set', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const wrapped = withAuth(handler)

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE' })
    const res = await wrapped(makeRequest('emp-1'))
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

/**
 * Test-only header fallback in `lib/auth/getCurrentUserId.ts`.
 *
 * In production, identity comes from a signed iron-session cookie populated by
 * the Azure AD callback (`@azure/msal-node` + PKCE). The cookie can't be
 * forged. The `x-current-user-id` header is accepted only when
 * `NODE_ENV === 'test'` so the existing route-handler suite can keep passing
 * a plain header instead of minting sealed cookies. These tests pin that
 * fallback behavior and the wrapper's DB-lookup defense.
 */
describe('withAuth: test-only header fallback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves an existing admin from the test-only header', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const wrapped = withAdmin(handler)

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' })
    const res = await wrapped(makeRequest('admin-1'))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('rejects when the header points at a non-existent user', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const wrapped = withAdmin(handler)

    mockPrisma.user.findUnique.mockResolvedValue(null)
    const res = await wrapped(makeRequest('definitely-not-a-real-id'))

    // The DB lookup is the wrapper's defense. Even with the test-only header
    // path, the id must resolve to a real users row.
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })
})

/**
 * Tests for `assertTeamMember(ctx, teamId, allowedRoles?)`. The function lives
 * next to the wrapper but is called separately by routes because the teamId
 * is only known once the route has parsed its body/params.
 */
describe('assertTeamMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null for a LEADER who is an active member of the team', async () => {
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'membership-1' })

    const result = await assertTeamMember(
      { userId: 'leader-1', role: 'LEADER' },
      'team-1'
    )

    expect(result).toBeNull()
    expect(mockPrisma.teamMembership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'leader-1', teamId: 'team-1', status: 'active' },
      select: { id: true },
    })
  })

  it('returns 403 when the user is not a member of the team', async () => {
    mockPrisma.teamMembership.findFirst.mockResolvedValue(null)

    const result = await assertTeamMember(
      { userId: 'employee-x', role: 'EMPLOYEE' },
      'team-y'
    )

    expect(result?.status).toBe(403)
    await expect(result?.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('returns null for ADMIN even without a membership row (admin bypass)', async () => {
    const result = await assertTeamMember(
      { userId: 'admin-1', role: 'ADMIN' },
      'some-team'
    )

    expect(result).toBeNull()
    // The membership table should not be queried for admins. This is the
    // whole point of the bypass. If this assertion regresses, admins would
    // get locked out of teams they aren't formally members of.
    expect(mockPrisma.teamMembership.findFirst).not.toHaveBeenCalled()
  })

  it('returns 403 when role is not in allowedRoles, even if the user is a member', async () => {
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'membership-1' })

    const result = await assertTeamMember(
      { userId: 'employee-1', role: 'EMPLOYEE' },
      'team-1',
      ['ADMIN', 'LEADER']
    )

    expect(result?.status).toBe(403)
    // The role check short-circuits before the membership lookup so we don't
    // burn a DB query on a request that is going to fail anyway.
    expect(mockPrisma.teamMembership.findFirst).not.toHaveBeenCalled()
  })

  it('admits an ADMIN that passes the role filter without checking membership', async () => {
    const result = await assertTeamMember(
      { userId: 'admin-1', role: 'ADMIN' },
      'team-1',
      ['ADMIN', 'LEADER']
    )

    expect(result).toBeNull()
    expect(mockPrisma.teamMembership.findFirst).not.toHaveBeenCalled()
  })
})
