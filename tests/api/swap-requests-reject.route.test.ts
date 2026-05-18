import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    swapRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notification:   { create: vi.fn() },
    auditLog:       { create: vi.fn() },
    user:           { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
    $transaction:   vi.fn(),
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { POST as reject } from '@/app/api/swap-requests/[id]/reject/route'

/** Builds a POST request with an optional x-current-user-id header. */
function makeRequest(userId?: string): Request {
  return new Request('http://localhost/api/swap-requests/sr-1/reject', {
    method: 'POST',
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

const baseSwapRequest = {
  id: 'sr-1',
  teamId: 'team-1',
  requestedByUserId: 'user-1',
  fromUserId: 'user-1',
  toUserId: 'user-2',
  shiftId: 'shift-1',
  shift: { id: 'shift-1', date: '2026-04-28' },
}

/** Tests for POST /api/swap-requests/[id]/reject. */
describe('POST /api/swap-requests/[id]/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.auditLog.create.mockResolvedValue({})
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'leader-1', role: 'LEADER' })
    // assertTeamMember requires an active membership row for non-admin callers
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm1' })
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 401 when currentUserId is missing', async () => {
    const res = await reject(makeRequest(), { params: { id: 'sr-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when swap request does not exist', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue(null)
    const res = await reject(makeRequest('leader-1'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Swap request not found' })
  })

  it('returns 400 when status is not PENDING', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'APPROVED' })
    const res = await reject(makeRequest('leader-1'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Swap request is not pending' })
  })

  it('rejects swap request and notifies requester', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'PENDING' })
    mockPrisma.swapRequest.update.mockResolvedValue({ ...baseSwapRequest, status: 'REJECTED' })

    const res = await reject(makeRequest('leader-1'), { params: { id: 'sr-1' } })

    expect(res.status).toBe(200)
    expect(mockPrisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) })
    )
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
  })
})
