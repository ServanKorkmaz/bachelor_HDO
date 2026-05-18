import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    team:         { findUnique: vi.fn(), delete: vi.fn() },
    user:         { findUnique: vi.fn() },
    auditLog:     { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { DELETE } from '@/app/api/teams/[id]/route'

/** Builds a DELETE request optionally signed by `userId`. */
function makeDelete(userId?: string): Request {
  return new Request('http://localhost/api/teams/team-1', {
    method: 'DELETE',
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

const ADMIN_USER = { id: 'admin-1', role: 'ADMIN' }
const EMPLOYEE_USER = { id: 'emp-1', role: 'EMPLOYEE' }

describe('DELETE /api/teams/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await DELETE(makeDelete(), { params: { id: 'team-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not an admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(EMPLOYEE_USER)
    const res = await DELETE(makeDelete('emp-1'), { params: { id: 'team-1' } })
    expect(res.status).toBe(403)
  })

  it('returns 404 when the team does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockPrisma.team.findUnique.mockResolvedValue(null)

    const res = await DELETE(makeDelete('admin-1'), { params: { id: 'team-1' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.team.delete).not.toHaveBeenCalled()
  })

  it('deletes the team and writes an audit entry capturing the name', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockPrisma.team.findUnique.mockResolvedValue({ id: 'team-1', name: 'Team A' })
    mockPrisma.team.delete.mockResolvedValue({})

    const res = await DELETE(makeDelete('admin-1'), { params: { id: 'team-1' } })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(mockPrisma.team.delete).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'TEAM_DELETED',
          entityType: 'team',
          entityId: 'team-1',
          beforeJson: expect.stringContaining('"name":"Team A"'),
          afterJson: null,
        }),
      }),
    )
  })
})
