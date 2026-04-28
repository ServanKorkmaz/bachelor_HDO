import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    note:         { update: vi.fn() },
    notification: { create: vi.fn() },
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { POST } from '@/app/api/notes/[id]/approve/route'

/** Builds a JSON POST request for the note approve endpoint. */
function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/notes/note-1/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

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
    mockPrisma.notification.create.mockResolvedValue({})
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 400 for invalid status', async () => {
    const res = await POST(makeRequest({ status: 'INVALID' }), { params: { id: 'note-1' } })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid status' })
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
