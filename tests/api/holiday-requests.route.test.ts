import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    holidayRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user:           { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
    notification:   { create: vi.fn() },
    auditLog:       { create: vi.fn() },
    $transaction:   vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, POST } from '@/app/api/holiday-requests/route'
import {
  DELETE,
  PATCH,
} from '@/app/api/holiday-requests/[id]/route'

function makeGet(params: Record<string, string> = {}, userId?: string): Request {
  const url = new URL('http://localhost/api/holiday-requests')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/holiday-requests', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

function makePatch(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/holiday-requests/hr-1', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

function makeDelete(userId?: string): Request {
  return new Request('http://localhost/api/holiday-requests/hr-1', {
    method: 'DELETE',
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

const baseHolidayRequest = {
  id: 'hr-1',
  teamId: 'team-1',
  userId: 'user-1',
  type: 'HOLIDAY',
  status: 'PENDING',
  dateFrom: '2027-01-01',
  dateTo: null,
  user: { id: 'user-1', name: 'Alice' },
}

/** Tests for GET, POST, PATCH and DELETE /api/holiday-requests. */
describe('holiday-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.auditLog.create.mockResolvedValue({})
  })

  describe('GET /api/holiday-requests', () => {
    it('returns 400 when teamId is missing (authenticated caller)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', teamId: 'team-1' })
      const res = await GET(makeGet({}, 'admin-1'))
      expect(res.status).toBe(400)
    })

    it('returns 401 when caller is not authenticated', async () => {
      const res = await GET(makeGet({ teamId: 'team-1' }))
      expect(res.status).toBe(401)
    })

    it('returns list of holiday requests for a team member', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', teamId: 'team-1' })
      mockPrisma.holidayRequest.findMany.mockResolvedValue([baseHolidayRequest])
      const res = await GET(makeGet({ teamId: 'team-1' }, 'admin-1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
    })
  })

  describe('POST /api/holiday-requests', () => {
    beforeEach(() => {
      // The wrapper's user lookup returns the caller; the second lookup inside
      // POST is for the same user to derive their teamId. Both return Alice.
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'EMPLOYEE', teamId: 'team-1' })
      // No overlapping requests in the default setup.
      mockPrisma.holidayRequest.findFirst.mockResolvedValue(null)
    })

    it('returns 401 when caller is not authenticated', async () => {
      const res = await POST(makePost({ type: 'HOLIDAY', dateFrom: '2027-01-01' }))
      expect(res.status).toBe(401)
    })

    it('returns 400 when required fields are missing', async () => {
      const res = await POST(makePost({}, 'user-1'))
      expect(res.status).toBe(400)
    })

    it('returns 400 for holiday/absence with start date in the past', async () => {
      const res = await POST(makePost({
        type: 'HOLIDAY',
        dateFrom: '2020-01-01',
      }, 'user-1'))
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({ error: 'Start date cannot be in the past for holiday/absence' })
      )
    })

    it('returns 400 for sickness older than 30 days', async () => {
      const res = await POST(makePost({
        type: 'SICKNESS',
        dateFrom: '2020-01-01',
      }, 'user-1'))
      expect(res.status).toBe(400)
    })

    it('creates holiday request and notifies team', async () => {
      mockPrisma.holidayRequest.create.mockResolvedValue({
        ...baseHolidayRequest,
        user: { id: 'user-1', name: 'Alice' },
      })

      const res = await POST(makePost({
        type: 'HOLIDAY',
        dateFrom: '2027-01-01',
      }, 'user-1'))

      expect(res.status).toBe(200)
      expect(mockPrisma.holidayRequest.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
    })

    it('forces userId/teamId to the authenticated caller, ignoring the body', async () => {
      mockPrisma.holidayRequest.create.mockResolvedValue({
        ...baseHolidayRequest,
        user: { id: 'user-1', name: 'Alice' },
      })

      await POST(makePost({
        type: 'HOLIDAY',
        dateFrom: '2027-01-01',
        userId: 'spoofed-victim',
        teamId: 'spoofed-team',
      }, 'user-1'))

      expect(mockPrisma.holidayRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', teamId: 'team-1' }),
        })
      )
    })

    it('rejects overlapping request with 409 and skips the create', async () => {
      mockPrisma.holidayRequest.findFirst.mockResolvedValueOnce({ id: 'hr-existing' })

      const res = await POST(makePost({
        type: 'HOLIDAY',
        dateFrom: '2027-01-01',
        dateTo: '2027-01-07',
      }, 'user-1'))

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/overlapper/i)
      expect(mockPrisma.holidayRequest.create).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /api/holiday-requests/[id]', () => {
    it('returns 401 when currentUserId is missing', async () => {
      const res = await PATCH(makePatch({ action: 'APPROVE' }), { params: { id: 'hr-1' } })
      expect(res.status).toBe(401)
    })

    it('returns 400 when action is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'leader-1', role: 'LEADER' })
      const res = await PATCH(makePatch({}, 'leader-1'), { params: { id: 'hr-1' } })
      expect(res.status).toBe(400)
    })

    it('approves holiday request', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'leader-1', role: 'ADMIN' })
      mockPrisma.holidayRequest.findUnique.mockResolvedValue(baseHolidayRequest)
      mockPrisma.holidayRequest.update.mockResolvedValue({ ...baseHolidayRequest, status: 'APPROVED', user: { id: 'user-1', name: 'Alice' } })

      const res = await PATCH(makePatch({ action: 'APPROVE' }, 'leader-1'), { params: { id: 'hr-1' } })

      expect(res.status).toBe(200)
      expect(mockPrisma.holidayRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) })
      )
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    })

    it('rejects holiday request', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'leader-1', role: 'ADMIN' })
      mockPrisma.holidayRequest.findUnique.mockResolvedValue(baseHolidayRequest)
      mockPrisma.holidayRequest.update.mockResolvedValue({ ...baseHolidayRequest, status: 'REJECTED', user: { id: 'user-1', name: 'Alice' } })

      const res = await PATCH(makePatch({ action: 'REJECT' }, 'leader-1'), { params: { id: 'hr-1' } })

      expect(res.status).toBe(200)
      expect(mockPrisma.holidayRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) })
      )
    })
  })

  describe('DELETE /api/holiday-requests/[id]', () => {
    beforeEach(() => {
      // Reflect the caller back as the wrapper's lookup result so the
      // ownership check (hr.userId === ctx.userId) succeeds for user-1.
      mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, role: 'EMPLOYEE' })
      )
    })

    it('returns 404 when request does not exist', async () => {
      mockPrisma.holidayRequest.findUnique.mockResolvedValue(null)
      const res = await DELETE(makeDelete('user-1'), { params: { id: 'hr-1' } })
      expect(res.status).toBe(404)
    })

    it('returns 400 when request is not PENDING', async () => {
      mockPrisma.holidayRequest.findUnique.mockResolvedValue({ ...baseHolidayRequest, status: 'APPROVED' })
      const res = await DELETE(makeDelete('user-1'), { params: { id: 'hr-1' } })
      expect(res.status).toBe(400)
    })

    it('deletes a PENDING request', async () => {
      mockPrisma.holidayRequest.findUnique.mockResolvedValue(baseHolidayRequest)
      mockPrisma.holidayRequest.delete.mockResolvedValue({})

      const res = await DELETE(makeDelete('user-1'), { params: { id: 'hr-1' } })
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ success: true })
    })
  })
})
