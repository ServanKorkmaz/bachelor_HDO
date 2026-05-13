import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    shift: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    shiftType:      { findUnique: vi.fn() },
    user:           { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
    notification:   { create: vi.fn() },
    $transaction:   vi.fn(),
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { PUT, DELETE } from '@/app/api/shifts/[id]/route'

/** Builds a JSON PUT request for a shift. */
function makePut(body: unknown, userId = 'admin-1'): Request {
  return new Request('http://localhost/api/shifts/shift-1', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-current-user-id': userId,
    },
    body: JSON.stringify(body),
  })
}

/** Builds a DELETE request for a shift. */
function makeDelete(userId = 'admin-1'): Request {
  return new Request('http://localhost/api/shifts/shift-1', {
    method: 'DELETE',
    headers: { 'x-current-user-id': userId },
  })
}

const ADMIN_USER = { id: 'admin-1', role: 'ADMIN', teamId: 'team-1' }

const baseShift = {
  id: 'shift-1',
  teamId: 'team-1',
  userId: 'user-1',
  date: '2026-04-28',
  user: { id: 'user-1', name: 'Alice' },
}

const validPutBody = {
  date: '2026-04-28',
  userId: 'user-1',
  shiftTypeId: 'type-1',
  startTime: '08:00',
  endTime: '16:00',
}

/** Tests for PUT and DELETE /api/shifts/[id]. */
describe('PUT /api/shifts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 401 when caller is not authenticated', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(baseShift)
    const req = new Request('http://localhost/api/shifts/shift-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validPutBody),
    })
    const res = await PUT(req, { params: { id: 'shift-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is an employee', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(baseShift)
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'emp-1', role: 'EMPLOYEE', teamId: 'team-1' })
    const res = await PUT(makePut(validPutBody, 'emp-1'), { params: { id: 'shift-1' } })
    expect(res.status).toBe(403)
  })

  it('returns 404 when shift does not exist', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(null)

    const res = await PUT(makePut(validPutBody), { params: { id: 'shift-1' } })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Shift not found' })
  })

  it('returns 404 when shift type does not exist', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(baseShift)
    mockPrisma.shiftType.findUnique.mockResolvedValue(null)

    const res = await PUT(makePut(validPutBody), { params: { id: 'shift-1' } })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Shift type not found' })
  })

  it('updates shift and notifies user', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(baseShift)
    mockPrisma.shiftType.findUnique.mockResolvedValue({ id: 'type-1', crossesMidnight: false })
    mockPrisma.shift.update.mockResolvedValue({ ...baseShift, shiftType: { id: 'type-1' } })

    const res = await PUT(makePut(validPutBody), { params: { id: 'shift-1' } })

    expect(res.status).toBe(200)
    expect(mockPrisma.shift.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
  })
})

/** Tests for DELETE /api/shifts/[id]. */
describe('DELETE /api/shifts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 401 when caller is not authenticated', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(baseShift)
    const req = new Request('http://localhost/api/shifts/shift-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'shift-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when shift does not exist', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(null)

    const res = await DELETE(makeDelete(), { params: { id: 'shift-1' } })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Shift not found' })
  })

  it('deletes shift and notifies user', async () => {
    mockPrisma.shift.findUnique.mockResolvedValue(baseShift)
    mockPrisma.shift.delete.mockResolvedValue({})

    const res = await DELETE(makeDelete(), { params: { id: 'shift-1' } })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(mockPrisma.shift.delete).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
  })
})
