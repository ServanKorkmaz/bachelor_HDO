import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    shift:          { findMany: vi.fn(), create: vi.fn() },
    user:           { findUnique: vi.fn() },
    shiftType:      { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
    notification:   { create: vi.fn() },
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { GET, POST } from '@/app/api/shifts/route'

/** Builds a GET request with optional query parameters. */
function makeGet(params: Record<string, string> = {}, userId?: string): Request {
  const url = new URL('http://localhost/api/shifts')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

/** Builds a JSON POST request for the shifts endpoint. */
function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/shifts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

const ADMIN_USER = { id: 'admin-1', role: 'ADMIN', teamId: 'team-1' }

/** Tests for GET /api/shifts. */
describe('GET /api/shifts', () => {
  beforeEach(() => vi.clearAllMocks())

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

  it('returns 403 when caller is not a team member', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-x', role: 'EMPLOYEE', teamId: 'team-2' })
    mockPrisma.teamMembership.findFirst.mockResolvedValue(null)
    const res = await GET(makeGet({ teamId: 'team-1' }, 'user-x'))
    expect(res.status).toBe(403)
  })

  it('returns list of shifts for a team member', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', teamId: 'team-1' })
    const fakeShifts = [{ id: 'shift-1', date: '2026-04-28', teamId: 'team-1' }]
    mockPrisma.shift.findMany.mockResolvedValue(fakeShifts)

    const res = await GET(makeGet({ teamId: 'team-1' }, 'admin-1'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(fakeShifts)
  })
})

/** Tests for POST /api/shifts. */
describe('POST /api/shifts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  const validBody = {
    teamId: 'team-1',
    userId: 'user-1',
    date: '2026-04-28',
    shiftTypeId: 'type-1',
    startTime: '08:00',
    endTime: '16:00',
  }

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makePost({ teamId: 'team-1' }, 'admin-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Ugyldig data')
    expect(body.details.fieldErrors).toMatchObject({
      date: expect.any(Array),
      userId: expect.any(Array),
      shiftTypeId: expect.any(Array),
    })
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is an employee (not ADMIN/LEADER)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'emp-1', role: 'EMPLOYEE', teamId: 'team-1' })
    const res = await POST(makePost(validBody, 'emp-1'))
    expect(res.status).toBe(403)
  })

  it('returns 404 when shift type does not exist', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue(null)

    const res = await POST(makePost({ ...validBody, shiftTypeId: 'type-x' }, 'admin-1'))

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

    const res = await POST(makePost(validBody, 'admin-1'))

    expect(res.status).toBe(200)
    expect(mockPrisma.shift.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
  })

  it('returns 400 when startTime equals endTime (zero-length shift)', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue({ id: 'type-1', crossesMidnight: false })

    const res = await POST(makePost({ ...validBody, startTime: '08:00', endTime: '08:00' }, 'admin-1'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/like/i)
    expect(mockPrisma.shift.create).not.toHaveBeenCalled()
  })

  it('returns 409 when the (userId, date) unique constraint is violated', async () => {
    const { Prisma } = await import('@prisma/client')
    mockPrisma.shiftType.findUnique.mockResolvedValue({ id: 'type-1', crossesMidnight: false })
    mockPrisma.shift.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique violation', {
        code: 'P2002',
        clientVersion: '5',
      })
    )

    const res = await POST(makePost(validBody, 'admin-1'))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/allerede/i)
  })
})
