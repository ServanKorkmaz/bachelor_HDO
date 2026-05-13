import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Hoisted mocks are required because `vi.mock()` factories are evaluated before
 * normal top-level variables in the file.
 */
const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    shiftType: {
      findMany: vi.fn(),
    },
    shift: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    teamMembership: {
      findFirst: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

/** Mock Prisma client used by the route under test. */
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

/** Mock channel delivery helper to avoid side effects during tests. */
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { POST } from '@/app/api/shifts/bulk/route'

/** Builds a JSON POST request for the bulk shifts endpoint. */
function makeRequest(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/shifts/bulk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

/**
 * This suite validates core behavior for bulk shift creation:
 * - authorization rules
 * - request validation rules
 * - one happy-path create flow including cross-midnight handling
 */
describe('POST /api/shifts/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))

    // Default mock behavior: authorized admin and no pre-existing shifts.
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
      teamId: 'team-1',
    })
    mockPrisma.user.findMany.mockResolvedValue([])
    mockPrisma.shiftType.findMany.mockResolvedValue([])
    mockPrisma.shift.findUnique.mockResolvedValue(null)
    mockPrisma.shift.findFirst.mockResolvedValue(null)
    // Bulk now delegates to shift-service.createShift, which calls
    // prisma.shift.create with `include: { shiftType, user }`. The mock must
    // return that shape so the service can build its notification message.
    mockPrisma.shift.create.mockResolvedValue({
      id: 'shift-1',
      teamId: 'team-1',
      userId: 'user-1',
      user: { id: 'user-1', name: 'Test User' },
    })
    mockPrisma.shift.update.mockResolvedValue({
      id: 'shift-1',
      teamId: 'team-1',
      userId: 'user-1',
      user: { id: 'user-1', name: 'Test User' },
    })
    mockPrisma.shift.delete.mockResolvedValue({})
    mockPrisma.notification.create.mockResolvedValue({})
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 401 when the caller is not authenticated', async () => {
    const response = await POST(
      makeRequest({
        action: 'create',
        teamId: 'team-1',
        items: [],
      })
    )

    expect(response.status).toBe(401)
  })

  it('returns 403 for non-admin/non-leader users', async () => {
    // Override default auth mock for this test case.
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'employee-1',
      role: 'EMPLOYEE',
      teamId: 'team-1',
    })

    const response = await POST(
      makeRequest(
        {
          action: 'create',
          teamId: 'team-1',
          items: [],
        },
        'employee-1'
      )
    )

    expect(response.status).toBe(403)
  })

  it('returns 400 for invalid action', async () => {
    const response = await POST(
      makeRequest(
        {
          action: 'invalid',
          teamId: 'team-1',
          items: [{ userId: 'user-1', date: '2026-04-27' }],
        },
        'admin-1'
      )
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Ugyldig data')
    expect(body.details.fieldErrors).toMatchObject({ action: expect.any(Array) })
  })

  it('returns 400 when item count exceeds max limit', async () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      userId: `user-${i}`,
      date: '2026-04-27',
      shiftTypeId: 'type-1',
      startTime: '08:00',
      endTime: '16:00',
    }))

    const response = await POST(
      makeRequest(
        {
          action: 'create',
          teamId: 'team-1',
          items,
        },
        'admin-1'
      )
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Ugyldig data')
    expect(body.details.fieldErrors).toMatchObject({ items: expect.any(Array) })
  })

  it('creates a shift and handles cross-midnight duration', async () => {
    // Set up user and shift type required for successful creation.
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'user-1', teamId: 'team-1' }])
    mockPrisma.shiftType.findMany.mockResolvedValueOnce([
      { id: 'type-night', crossesMidnight: true },
    ])

    const response = await POST(
      makeRequest(
        {
          action: 'create',
          teamId: 'team-1',
          items: [
            {
              userId: 'user-1',
              date: '2026-04-27',
              shiftTypeId: 'type-night',
              startTime: '22:00',
              endTime: '06:00',
              comment: 'Night shift',
            },
          ],
        },
        'admin-1'
      )
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.successes).toHaveLength(1)
    expect(body.failures).toHaveLength(0)

    // Validate that persisted times reflect an 8-hour overnight shift.
    expect(mockPrisma.shift.create).toHaveBeenCalledTimes(1)
    const createArgs = mockPrisma.shift.create.mock.calls[0][0]
    const startDateTime = createArgs.data.startDateTime as Date
    const endDateTime = createArgs.data.endDateTime as Date
    const hours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)

    expect(hours).toBe(8)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockDeliverNotificationToChannels).toHaveBeenCalledTimes(1)
  })
})
