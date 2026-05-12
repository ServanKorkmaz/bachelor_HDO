import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockDeliverNotificationToChannels } = vi.hoisted(() => ({
  mockPrisma: {
    note:           { findMany: vi.fn(), create: vi.fn() },
    notification:   { create: vi.fn() },
    user:           { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
  },
  mockDeliverNotificationToChannels: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotificationToChannels: mockDeliverNotificationToChannels,
}))

import { GET, POST } from '@/app/api/notes/route'

/** Builds a GET request with optional query parameters. */
function makeGet(params: Record<string, string> = {}, userId?: string): Request {
  const url = new URL('http://localhost/api/notes')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

/** Builds a JSON POST request for the notes endpoint. */
function makePost(body: unknown): Request {
  return new Request('http://localhost/api/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Tests for GET /api/notes. */
describe('GET /api/notes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when teamId is missing', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'teamId is required' })
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await GET(makeGet({ teamId: 'team-1' }))
    expect(res.status).toBe(401)
  })

  it('returns list of notes for a team member', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', teamId: 'team-1' })
    const fakeNotes = [{ id: 'note-1', teamId: 'team-1', type: 'HOLIDAY', status: 'PENDING' }]
    mockPrisma.note.findMany.mockResolvedValue(fakeNotes)

    const res = await GET(makeGet({ teamId: 'team-1' }, 'admin-1'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(fakeNotes)
  })
})

/** Tests for POST /api/notes. */
describe('POST /api/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.notification.create.mockResolvedValue({})
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makePost({ teamId: 'team-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Ugyldig data')
    expect(body.details.fieldErrors).toMatchObject({
      createdByUserId: expect.any(Array),
      type: expect.any(Array),
      body: expect.any(Array),
    })
  })

  it('creates note and notifies creator', async () => {
    mockPrisma.note.create.mockResolvedValue({
      id: 'note-1',
      teamId: 'team-1',
      createdByUserId: 'user-1',
      type: 'HOLIDAY',
      status: 'PENDING',
      body: 'Ferie',
      dateFrom: '2027-01-01',
      dateTo: '2027-01-07',
      createdBy: { id: 'user-1', name: 'Alice' },
    })

    const res = await POST(makePost({
      teamId: 'team-1',
      createdByUserId: 'user-1',
      type: 'HOLIDAY',
      body: 'Ferie',
      dateFrom: '2027-01-01',
      dateTo: '2027-01-07',
    }))

    expect(res.status).toBe(200)
    expect(mockPrisma.note.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
  })
})
