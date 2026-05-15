import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    swapRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    shift: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    notification:   { create: vi.fn() },
    auditLog:       { create: vi.fn() },
    user:           { findUnique: vi.fn() },
    holidayRequest: { findMany: vi.fn() },
    $transaction:   vi.fn(),
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { POST as approve } from '@/app/api/swap-requests/[id]/approve/route'
import { POST as execute } from '@/app/api/swap-requests/[id]/execute/route'

/** Builds a POST request with x-current-user-id header. */
function makeRequest(userId?: string): Request {
  return new Request('http://localhost/api/swap-requests/sr-1/action', {
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
  toShiftId: null,
  toShift: null,
  requestedBy: { id: 'user-1', name: 'Alice' },
  fromUser:    { id: 'user-1', name: 'Alice' },
  toUser:      { id: 'user-2', name: 'Bob' },
  shift: {
    id: 'shift-1',
    date: '2026-04-28',
    startDateTime: new Date('2026-04-28T08:00:00Z'),
    endDateTime: new Date('2026-04-28T16:00:00Z'),
  },
}

/** Tests for the approve and execute lifecycle of a swap request. */
describe('POST /api/swap-requests/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.auditLog.create.mockResolvedValue({})
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'leader-1', role: 'LEADER' })
    // executeSwap re-checks time overlap + AML against current state; default everything to "clean".
    mockPrisma.shift.findFirst.mockResolvedValue(null)
    mockPrisma.shift.findMany.mockResolvedValue([])
    mockPrisma.holidayRequest.findMany.mockResolvedValue([])
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 401 when currentUserId is missing', async () => {
    const res = await approve(makeRequest(), { params: { id: 'sr-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when swap request does not exist', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue(null)
    const res = await approve(makeRequest('leader-1'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when status is not PENDING', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'APPROVED' })
    const res = await approve(makeRequest('leader-1'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Swap request is not pending' })
  })

  it('approves swap request and notifies requester', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'PENDING' })
    mockPrisma.swapRequest.update.mockResolvedValue({ ...baseSwapRequest, status: 'APPROVED' })

    const res = await approve(makeRequest('leader-1'), { params: { id: 'sr-1' } })

    expect(res.status).toBe(200)
    expect(mockPrisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) })
    )
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/swap-requests/[id]/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.auditLog.create.mockResolvedValue({})
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'leader-1', role: 'LEADER' })
    // executeSwap re-checks time overlap + AML against current state; default everything to "clean".
    mockPrisma.shift.findFirst.mockResolvedValue(null)
    mockPrisma.shift.findMany.mockResolvedValue([])
    mockPrisma.holidayRequest.findMany.mockResolvedValue([])
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 401 when currentUserId is missing', async () => {
    const res = await execute(makeRequest(), { params: { id: 'sr-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when swap request does not exist', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue(null)
    const res = await execute(makeRequest('leader-1'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when status is not APPROVED', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'PENDING' })
    const res = await execute(makeRequest('leader-1'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Swap request must be approved before execution' })
  })

  it('executes swap — reassigns shift to new user and notifies both parties', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'APPROVED' })
    mockPrisma.shift.update.mockResolvedValue({})
    mockPrisma.swapRequest.update.mockResolvedValue({ ...baseSwapRequest, status: 'EXECUTED' })

    const res = await execute(makeRequest('leader-1'), { params: { id: 'sr-1' } })

    expect(res.status).toBe(200)
    // Shift must be reassigned to toUserId.
    expect(mockPrisma.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'user-2' } })
    )
    // Both fromUser and toUser should receive a notification.
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2)
    expect(mockDeliverNotificationToChannels).toHaveBeenCalledTimes(2)
  })
})
