import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    swapRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notification: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST as accept } from '@/app/api/swap-requests/[id]/accept/route'
import { POST as decline } from '@/app/api/swap-requests/[id]/decline/route'

/** Builds a POST request with an optional x-current-user-id header. */
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
  requestedBy: { id: 'user-1', name: 'Alice' },
  toUser: { id: 'user-2', name: 'Bob' },
}

/** Tests for employee accept/decline of a swap request. */
describe('POST /api/swap-requests/[id]/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
  })

  it('returns 401 when currentUserId is missing', async () => {
    const res = await accept(makeRequest(), { params: { id: 'sr-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when swap request does not exist', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue(null)
    const res = await accept(makeRequest('user-2'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when status is not AWAITING_ACCEPTANCE', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'PENDING' })
    const res = await accept(makeRequest('user-2'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 403 when wrong user tries to accept', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'AWAITING_ACCEPTANCE' })
    const res = await accept(makeRequest('user-99'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(403)
  })

  it('accepts swap request, sets status to PENDING, and sends two notifications', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'AWAITING_ACCEPTANCE' })
    mockPrisma.swapRequest.update.mockResolvedValue({ ...baseSwapRequest, status: 'PENDING' })

    const res = await accept(makeRequest('user-2'), { params: { id: 'sr-1' } })

    expect(res.status).toBe(200)
    expect(mockPrisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDING' } })
    )
    // One notification to requester + one team-wide for leader
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2)
  })
})

describe('POST /api/swap-requests/[id]/decline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
  })

  it('returns 401 when currentUserId is missing', async () => {
    const res = await decline(makeRequest(), { params: { id: 'sr-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when swap request does not exist', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue(null)
    const res = await decline(makeRequest('user-2'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when status is not AWAITING_ACCEPTANCE', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'PENDING' })
    const res = await decline(makeRequest('user-2'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 403 when wrong user tries to decline', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'AWAITING_ACCEPTANCE' })
    const res = await decline(makeRequest('user-99'), { params: { id: 'sr-1' } })
    expect(res.status).toBe(403)
  })

  it('declines swap request, sets status to REJECTED, and sends one notification', async () => {
    mockPrisma.swapRequest.findUnique.mockResolvedValue({ ...baseSwapRequest, status: 'AWAITING_ACCEPTANCE' })
    mockPrisma.swapRequest.update.mockResolvedValue({ ...baseSwapRequest, status: 'REJECTED' })

    const res = await decline(makeRequest('user-2'), { params: { id: 'sr-1' } })

    expect(res.status).toBe(200)
    expect(mockPrisma.swapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) })
    )
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
  })
})
