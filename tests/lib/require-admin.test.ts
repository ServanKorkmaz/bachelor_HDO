import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { requireAdmin } from '@/lib/auth/requireAdmin'

/** Builds a GET request with optional x-current-user-id header. */
function makeRequest(userId?: string): Request {
  return new Request('http://localhost/api/admin/test', {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

/** Unit tests for the requireAdmin auth middleware. */
describe('requireAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when currentUserId is missing', async () => {
    const auth = {}
    const res = await requireAdmin(makeRequest(), auth)
    expect(res?.status).toBe(401)
    await expect(res?.json()).resolves.toEqual({ error: 'Not authorized' })
  })

  it('returns 403 when user does not exist in database', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const auth = {}
    const res = await requireAdmin(makeRequest('unknown-user'), auth)
    expect(res?.status).toBe(403)
    await expect(res?.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('returns 403 when user is not ADMIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'EMPLOYEE' })
    const auth = {}
    const res = await requireAdmin(makeRequest('user-1'), auth)
    expect(res?.status).toBe(403)
  })

  it('returns null and sets currentUser when user is ADMIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' })
    const auth: { currentUser?: { id: string; role: string } } = {}
    const res = await requireAdmin(makeRequest('admin-1'), auth)
    expect(res).toBeNull()
    expect(auth.currentUser).toEqual({ id: 'admin-1', role: 'ADMIN' })
  })
})
