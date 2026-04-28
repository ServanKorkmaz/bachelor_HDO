import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    shift:     { findMany: vi.fn(), create: vi.fn() },
    user:      { findUnique: vi.fn() },
    shiftType: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { GET, POST } from '@/app/api/shifts/route'

/** Builds a GET request with optional query parameters. */
function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/shifts')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

/** Builds a JSON POST request for the shifts endpoint. */
function makePost(body: unknown): Request {
  return new Request('http://localhost/api/shifts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Tests for GET /api/shifts. */
describe('GET /api/shifts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when teamId is missing', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'teamId is required' })
  })

  it('returns list of shifts for a team', async () => {
    const fakeShifts = [{ id: 'shift-1', date: '2026-04-28', teamId: 'team-1' }]
    mockPrisma.shift.findMany.mockResolvedValue(fakeShifts)

    const res = await GET(makeGet({ teamId: 'team-1' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(fakeShifts)
  })
})

/** Tests for POST /api/shifts. */
describe('POST /api/shifts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.notification.create.mockResolvedValue({})
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makePost({ teamId: 'team-1' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
  })

  it('returns 404 when shift type does not exist', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue(null)

    const res = await POST(makePost({
      teamId: 'team-1',
      userId: 'user-1',
      date: '2026-04-28',
      shiftTypeId: 'type-x',
      startTime: '08:00',
      endTime: '16:00',
    }))

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Shift type not found' })
  })

  it('creates shift and notifies user', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue({ id: 'type-1', crossesMidnight: false })
    mockPrisma.shift.create.mockResolvedValue({
      id: 'shift-1',
      teamId: 'team-1',
      userId: 'user-1',
      date: '2026-04-28',
      user: { id: 'user-1', name: 'Alice' },
      shiftType: { id: 'type-1' },
    })

    const res = await POST(makePost({
      teamId: 'team-1',
      userId: 'user-1',
      date: '2026-04-28',
      shiftTypeId: 'type-1',
      startTime: '08:00',
      endTime: '16:00',
    }))

    expect(res.status).toBe(200)
    expect(mockPrisma.shift.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
  })
})
