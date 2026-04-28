import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    auditLog:     { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { PATCH } from '@/app/api/admin/users/[id]/route'

/**
 * Builds a PATCH request with an optional x-current-user-id header.
 * params is a Promise to match the Next.js 15 dynamic-route contract.
 */
function makePatch(body: unknown, userId?: string) {
  const request = new Request('http://localhost/api/admin/users/user-1', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id: 'user-1' }) } }
}

const adminUser = { id: 'admin-1', role: 'ADMIN' }

/** Tests for PATCH /api/admin/users/[id] (activate/deactivate a user). */
describe('PATCH /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.auditLog.create.mockResolvedValue({})
  })

  it('returns 401 when currentUserId is missing', async () => {
    const { request, context } = makePatch({ status: 'inactive' })
    const res = await PATCH(request, context)
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not ADMIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'EMPLOYEE' })
    const { request, context } = makePatch({ status: 'inactive' }, 'user-1')
    const res = await PATCH(request, context)
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid status value', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(adminUser)
    const { request, context } = makePatch({ status: 'blocked' }, 'admin-1')
    const res = await PATCH(request, context)
    expect(res.status).toBe(400)
  })

  it('returns 404 when target user does not exist', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(adminUser) // auth check
      .mockResolvedValueOnce(null)      // target user not found
    const { request, context } = makePatch({ status: 'inactive' }, 'admin-1')
    const res = await PATCH(request, context)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'User not found' })
  })

  it('returns current user unchanged when status is already the same', async () => {
    const existingUser = { id: 'user-1', status: 'inactive', name: 'Alice' }
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(adminUser)  // auth check
      .mockResolvedValueOnce(existingUser) // target user (same status)
      .mockResolvedValueOnce(existingUser) // second lookup for return value
    const { request, context } = makePatch({ status: 'inactive' }, 'admin-1')
    const res = await PATCH(request, context)
    expect(res.status).toBe(200)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('updates user status and writes audit log', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(adminUser)                            // auth check
      .mockResolvedValueOnce({ id: 'user-1', status: 'active', name: 'Alice' }) // target user
    mockPrisma.user.update.mockResolvedValue({ id: 'user-1', status: 'inactive' })

    const { request, context } = makePatch({ status: 'inactive' }, 'admin-1')
    const res = await PATCH(request, context)

    expect(res.status).toBe(200)
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'inactive' } })
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
  })
})
