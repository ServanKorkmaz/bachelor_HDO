import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    note:           { findUnique: vi.fn(), update: vi.fn() },
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

import { POST } from '@/app/api/notes/[id]/approve/route'

/** Builds a JSON POST request for the note approve endpoint. */
function makeRequest(body: unknown, userId = 'leader-1'): Request {
  return new Request('http://localhost/api/notes/note-1/approve', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-current-user-id': userId,
    },
    body: JSON.stringify(body),
  })
}

const LEADER_USER = { id: 'leader-1', role: 'LEADER', teamId: 'team-1' }

const baseNote = {
  id: 'note-1',
  teamId: 'team-1',
  createdByUserId: 'user-1',
  title: 'Ferie',
  type: 'HOLIDAY',
  status: 'PENDING',
  createdBy: { id: 'user-1', name: 'Alice' },
}

/** Tests for POST /api/notes/[id]/approve (approve or reject a note). */
describe('POST /api/notes/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.note.findUnique.mockResolvedValue({ teamId: 'team-1' })
    mockPrisma.user.findUnique.mockResolvedValue(LEADER_USER)
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'membership-1' })
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 401 when caller is not authenticated', async () => {
    const req = new Request('http://localhost/api/notes/note-1/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED' }),
    })
    const res = await POST(req, { params: { id: 'note-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is an employee (not ADMIN/LEADER)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'emp-1', role: 'EMPLOYEE', teamId: 'team-1' })
    const res = await POST(makeRequest({ status: 'APPROVED' }, 'emp-1'), { params: { id: 'note-1' } })
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid status', async () => {
    const res = await POST(makeRequest({ status: 'INVALID' }), { params: { id: 'note-1' } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Ugyldig data')
    expect(body.details.fieldErrors).toMatchObject({ status: expect.any(Array) })
  })

  it('approves note and notifies owner via notification and deliver', async () => {
    mockPrisma.note.update.mockResolvedValue({ ...baseNote, status: 'APPROVED' })

    const res = await POST(makeRequest({ status: 'APPROVED' }), { params: { id: 'note-1' } })

    expect(res.status).toBe(200)
    expect(mockPrisma.note.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'APPROVED' } })
    )
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockDeliverNotificationToChannels).toHaveBeenCalledTimes(1)
  })

  it('rejects note and notifies owner', async () => {
    mockPrisma.note.update.mockResolvedValue({ ...baseNote, status: 'REJECTED' })

    const res = await POST(makeRequest({ status: 'REJECTED' }), { params: { id: 'note-1' } })

    expect(res.status).toBe(200)
    expect(mockPrisma.note.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REJECTED' } })
    )
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
  })
})
