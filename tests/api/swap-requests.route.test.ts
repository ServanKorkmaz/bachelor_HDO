import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    swapRequest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    shift: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user:           { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
    notification:   { create: vi.fn() },
    auditLog:       { create: vi.fn() },
    holidayRequest: { findMany: vi.fn() },
    $transaction:   vi.fn(),
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { GET, POST } from '@/app/api/swap-requests/route'

/** Builds a GET request with optional query parameters. */
function makeGet(params: Record<string, string> = {}, userId?: string): Request {
  const url = new URL('http://localhost/api/swap-requests')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

/** Builds a JSON POST request for the swap-requests endpoint. */
function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/swap-requests', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

const EMPLOYEE_USER = { id: 'user-1', role: 'EMPLOYEE', teamId: 'team-1' }

/** Tests for GET and POST /api/swap-requests. */
describe('GET /api/swap-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
  })

  it('returns 400 when teamId is missing (authenticated caller)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', teamId: 'team-1' })
    const res = await GET(makeGet({}, 'admin-1'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'teamId is required' })
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await GET(makeGet({ teamId: 'team-1' }))
    expect(res.status).toBe(401)
  })

  it('returns list of swap requests for a team member', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', teamId: 'team-1' })
    const fakeRequests = [{ id: 'sr-1', status: 'AWAITING_ACCEPTANCE' }]
    mockPrisma.swapRequest.findMany.mockResolvedValue(fakeRequests)

    const res = await GET(makeGet({ teamId: 'team-1' }, 'admin-1'))
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
    mockPrisma.user.findUnique.mockResolvedValue(EMPLOYEE_USER)
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'membership-1' })
    // No duplicate active request by default.
    mockPrisma.swapRequest.findFirst.mockResolvedValue(null)
    // No conflicting shift on the recipient by default.
    mockPrisma.shift.findFirst.mockResolvedValue(null)
    // AML validation defaults to "clean". No neighbouring shifts, no holidays.
    mockPrisma.shift.findMany.mockResolvedValue([])
    mockPrisma.holidayRequest.findMany.mockResolvedValue([])
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  const validBody = {
    teamId: 'team-1',
    shiftId: 'shift-1',
    toUserId: 'user-2',
  }

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makePost({ teamId: 'team-1' }, 'user-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Ugyldig data')
    expect(body.details.fieldErrors).toMatchObject({
      shiftId: expect.any(Array),
      toUserId: expect.any(Array),
    })
  })

  it('still requires shiftId even if requestedByUserId is provided', async () => {
    const res = await POST(makePost({ teamId: 'team-1', requestedByUserId: 'spoofed' }, 'user-1'))
    expect(res.status).toBe(400)
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(401)
  })

  it('forces requestedByUserId to the authenticated caller, ignoring the body value', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue({
      id: 'shift-1',
      userId: 'user-3',
      date: '2026-04-28',
      startDateTime: new Date('2026-04-28T08:00:00Z'),
      endDateTime: new Date('2026-04-28T16:00:00Z'),
    })
    mockPrisma.swapRequest.create.mockResolvedValue({
      id: 'sr-1', requestedBy: { id: 'user-1', name: 'Alice' },
      fromUser: { id: 'user-3', name: '' }, toUser: { id: 'user-2', name: '' },
      shift: { id: 'shift-1', date: '2026-04-28', shiftType: {} },
    })

    await POST(makePost({ ...validBody, requestedByUserId: 'spoofed-victim' }, 'user-1'))

    expect(mockPrisma.swapRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestedByUserId: 'user-1' }),
      })
    )
  })

  it('returns 404 when shift does not exist', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(null)
    const res = await POST(makePost(validBody, 'user-1'))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Shift not found' })
  })

  it('returns 422 AML_DAILY_REST when the recipient would lose required rest', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue({
      id: 'shift-1',
      userId: 'user-1',
      date: '2026-04-28',
      startDateTime: new Date('2026-04-28T06:00:00Z'),
      endDateTime: new Date('2026-04-28T14:00:00Z'),
    })
    // Recipient (user-2) already has a shift ending 22:00 the night before. Only 8h rest.
    mockPrisma.shift.findMany.mockResolvedValue([
      {
        id: 'other-1',
        date: '2026-04-27',
        startDateTime: new Date('2026-04-27T14:00:00Z'),
        endDateTime: new Date('2026-04-27T22:00:00Z'),
      },
    ])

    const res = await POST(makePost(validBody, 'user-1'))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/hvile mellom vakter/i)
    expect(mockPrisma.swapRequest.create).not.toHaveBeenCalled()
  })

  it('creates swap request and notifies recipient', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue({
      id: 'shift-1',
      userId: 'user-1',
      date: '2026-04-28',
      startDateTime: new Date('2026-04-28T08:00:00Z'),
      endDateTime: new Date('2026-04-28T16:00:00Z'),
    })
    const fakeSwapRequest = {
      id: 'sr-1',
      requestedBy: { id: 'user-1', name: 'Alice' },
      fromUser:    { id: 'user-1', name: 'Alice' },
      toUser:      { id: 'user-2', name: 'Bob' },
      shift:       { id: 'shift-1', date: '2026-04-28', shiftType: {} },
    }
    mockPrisma.swapRequest.create.mockResolvedValue(fakeSwapRequest)

    const res = await POST(makePost({ ...validBody, message: 'Kan du ta vakten?' }, 'user-1'))

    expect(res.status).toBe(200)
    expect(mockPrisma.swapRequest.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
  })
})
