import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    swapRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    shift: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notification: { create: vi.fn() },
    auditLog:     { create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { GET, POST } from '@/app/api/swap-requests/route'

/** Builds a GET request with optional query parameters. */
function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/swap-requests')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

/** Builds a JSON POST request for the swap-requests endpoint. */
function makePost(body: unknown): Request {
  return new Request('http://localhost/api/swap-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Tests for GET and POST /api/swap-requests. */
describe('GET /api/swap-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
  })

  it('returns 400 when teamId is missing', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'teamId is required' })
  })

  it('returns list of swap requests for a team', async () => {
    const fakeRequests = [{ id: 'sr-1', status: 'AWAITING_ACCEPTANCE' }]
    mockPrisma.swapRequest.findMany.mockResolvedValue(fakeRequests)

    const res = await GET(makeGet({ teamId: 'team-1' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(fakeRequests)
  })
})

describe('POST /api/swap-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.auditLog.create.mockResolvedValue({})
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makePost({ teamId: 'team-1' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
  })

  it('returns 404 when shift does not exist', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(null)

    const res = await POST(makePost({
      teamId: 'team-1',
      requestedByUserId: 'user-1',
      shiftId: 'shift-x',
      toUserId: 'user-2',
    }))

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Shift not found' })
  })

  it('creates swap request and notifies recipient', async () => {
    // Shift belongs to user-1; user-1 requests swap with user-2.
    mockPrisma.shift.findUnique.mockResolvedValue({ id: 'shift-1', userId: 'user-1' })
    const fakeSwapRequest = {
      id: 'sr-1',
      requestedBy: { id: 'user-1', name: 'Alice' },
      fromUser:    { id: 'user-1', name: 'Alice' },
      toUser:      { id: 'user-2', name: 'Bob' },
      shift:       { id: 'shift-1', date: '2026-04-28', shiftType: {} },
    }
    mockPrisma.swapRequest.create.mockResolvedValue(fakeSwapRequest)

    const res = await POST(makePost({
      teamId: 'team-1',
      requestedByUserId: 'user-1',
      shiftId: 'shift-1',
      toUserId: 'user-2',
      message: 'Kan du ta vakten?',
    }))

    expect(res.status).toBe(200)
    expect(mockPrisma.swapRequest.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
  })
})
