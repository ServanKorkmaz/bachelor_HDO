import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    shiftType:           { findMany: vi.fn(), create: vi.fn() },
    user:                { findUnique: vi.fn() },
    auditLog:            { create: vi.fn() },
    $transaction:        vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, POST } from '@/app/api/shift-types/route'

/** Builds a GET request optionally signed by `userId`. */
function makeGet(userId?: string): Request {
  return new Request('http://localhost/api/shift-types', {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

/** Builds a JSON POST request optionally signed by `userId`. */
function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/shift-types', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

const ADMIN_USER = { id: 'admin-1', role: 'ADMIN' }
const EMPLOYEE_USER = { id: 'emp-1', role: 'EMPLOYEE' }

const validBody = {
  code: 'D',
  label: 'Dagvakt',
  color: '#3B82F6',
  defaultStartTime: '08:00',
  defaultEndTime: '16:00',
  crossesMidnight: false,
}

describe('GET /api/shift-types', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when caller is not authenticated', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('returns list of shift types to any authenticated caller', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(EMPLOYEE_USER)
    const fake = [{ id: 'type-1', code: 'D', label: 'Dagvakt' }]
    mockPrisma.shiftType.findMany.mockResolvedValue(fake)

    const res = await GET(makeGet('emp-1'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(fake)
  })
})

describe('POST /api/shift-types', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not an admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(EMPLOYEE_USER)
    const res = await POST(makePost(validBody, 'emp-1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when required fields are missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    const res = await POST(makePost({ code: 'D' }, 'admin-1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.shiftType.create).not.toHaveBeenCalled()
  })

  it('returns 400 when default start and end times are equal', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    const res = await POST(
      makePost({ ...validBody, defaultStartTime: '08:00', defaultEndTime: '08:00' }, 'admin-1'),
    )
    expect(res.status).toBe(400)
    expect(mockPrisma.shiftType.create).not.toHaveBeenCalled()
  })

  it('creates the shift type and writes an audit entry', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockPrisma.shiftType.create.mockResolvedValue({ id: 'type-new', ...validBody })

    const res = await POST(makePost(validBody, 'admin-1'))

    expect(res.status).toBe(200)
    expect(mockPrisma.shiftType.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'SHIFT_TYPE_CREATED',
          entityType: 'shift_type',
          entityId: 'type-new',
          afterJson: expect.stringContaining('"code":"D"'),
        }),
      }),
    )
  })
})
