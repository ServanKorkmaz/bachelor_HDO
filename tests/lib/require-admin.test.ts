import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { withAdmin, withAuth } from '@/lib/auth/withAuth'

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
