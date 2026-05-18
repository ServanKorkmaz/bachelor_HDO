import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    shiftType:    { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    user:         { findUnique: vi.fn() },
    auditLog:     { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { PUT, DELETE } from '@/app/api/shift-types/[id]/route'

/** Builds a JSON PUT request optionally signed by `userId`. */
function makePut(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/shift-types/type-1', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

/** Builds a DELETE request optionally signed by `userId`. */
function makeDelete(userId?: string): Request {
  return new Request('http://localhost/api/shift-types/type-1', {
    method: 'DELETE',
    headers: userId ? { 'x-current-user-id': userId } : {},
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

describe('PUT /api/shift-types/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await PUT(makePut(validBody), { params: { id: 'type-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not an admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(EMPLOYEE_USER)
    const res = await PUT(makePut(validBody, 'emp-1'), { params: { id: 'type-1' } })
    expect(res.status).toBe(403)
  })

  it('returns 404 when the shift type does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockPrisma.shiftType.findUnique.mockResolvedValue(null)

    const res = await PUT(makePut(validBody, 'admin-1'), { params: { id: 'type-1' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.shiftType.update).not.toHaveBeenCalled()
  })

  it('updates the shift type and writes an audit entry with before/after diff', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockPrisma.shiftType.findUnique.mockResolvedValue({
      id: 'type-1',
      code: 'OLD',
      label: 'Gammel',
      color: '#000000',
    })
    mockPrisma.shiftType.update.mockResolvedValue({ id: 'type-1', ...validBody })

    const res = await PUT(makePut(validBody, 'admin-1'), { params: { id: 'type-1' } })

    expect(res.status).toBe(200)
    expect(mockPrisma.shiftType.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'SHIFT_TYPE_UPDATED',
          entityType: 'shift_type',
          entityId: 'type-1',
          beforeJson: expect.stringContaining('"code":"OLD"'),
          afterJson: expect.stringContaining('"code":"D"'),
        }),
      }),
    )
  })
})

describe('DELETE /api/shift-types/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await DELETE(makeDelete(), { params: { id: 'type-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not an admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(EMPLOYEE_USER)
    const res = await DELETE(makeDelete('emp-1'), { params: { id: 'type-1' } })
    expect(res.status).toBe(403)
  })

  it('returns 404 when the shift type does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockPrisma.shiftType.findUnique.mockResolvedValue(null)

    const res = await DELETE(makeDelete('admin-1'), { params: { id: 'type-1' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.shiftType.delete).not.toHaveBeenCalled()
  })

  it('deletes the shift type and writes an audit entry', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockPrisma.shiftType.findUnique.mockResolvedValue({
      id: 'type-1',
      code: 'D',
      label: 'Dagvakt',
      color: '#3B82F6',
    })
    mockPrisma.shiftType.delete.mockResolvedValue({})

    const res = await DELETE(makeDelete('admin-1'), { params: { id: 'type-1' } })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(mockPrisma.shiftType.delete).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'SHIFT_TYPE_DELETED',
          entityType: 'shift_type',
          entityId: 'type-1',
          beforeJson: expect.stringContaining('"code":"D"'),
          afterJson: null,
        }),
      }),
    )
  })
})
