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
function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/notes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

const ADMIN_USER = { id: 'admin-1', role: 'ADMIN', teamId: 'team-1' }

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

  it('hides LEADERS-only notes from an EMPLOYEE caller', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE', teamId: 'team-1' })
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    mockPrisma.note.findMany.mockResolvedValue([])

    await GET(makeGet({ teamId: 'team-1' }, 'emp-1'))

    expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ visibility: { not: 'LEADERS' } }),
      })
    )
  })

  it('does not filter visibility for an ADMIN caller', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', teamId: 'team-1' })
    mockPrisma.note.findMany.mockResolvedValue([])

    await GET(makeGet({ teamId: 'team-1' }, 'admin-1'))

    const callArgs = mockPrisma.note.findMany.mock.calls[0][0]
    expect(callArgs.where).not.toHaveProperty('visibility')
  })
})

/** Tests for POST /api/notes. */
describe('POST /api/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.notification.create.mockResolvedValue({})
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockDeliverNotificationToChannels.mockResolvedValue(undefined)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makePost({ teamId: 'team-1' }, 'admin-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Ugyldig data')
    expect(body.details.fieldErrors).toMatchObject({
      type: expect.any(Array),
      body: expect.any(Array),
    })
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await POST(makePost({
      teamId: 'team-1',
      createdByUserId: 'user-1',
      type: 'HOLIDAY',
      body: 'Ferie',
      dateFrom: '2027-01-01',
      dateTo: '2027-01-07',
    }))
    expect(res.status).toBe(401)
  })

  it('forces createdByUserId to the authenticated caller, ignoring the body value', async () => {
    mockPrisma.note.create.mockResolvedValue({
      id: 'note-1', teamId: 'team-1', createdByUserId: 'admin-1',
      createdBy: { id: 'admin-1', name: 'Admin' },
    })

    await POST(makePost({
      teamId: 'team-1',
      createdByUserId: 'spoofed-victim',
      type: 'HOLIDAY',
      body: 'Ferie',
      dateFrom: '2027-01-01',
      dateTo: '2027-01-07',
    }, 'admin-1'))

    expect(mockPrisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdByUserId: 'admin-1' }),
      })
    )
  })

  it('rejects an unknown note type', async () => {
    const res = await POST(makePost({
      teamId: 'team-1',
      type: 'BOGUS_TYPE',
      body: 'x',
      dateFrom: '2027-01-01',
      dateTo: '2027-01-07',
    }, 'admin-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.details.fieldErrors).toMatchObject({ type: expect.any(Array) })
  })

  it('silently downgrades a LEADERS request from an EMPLOYEE to ALL', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'emp-1', role: 'EMPLOYEE', teamId: 'team-1' })
    mockPrisma.teamMembership.findFirst.mockResolvedValueOnce({ id: 'm-1' })
    mockPrisma.note.create.mockResolvedValue({ id: 'n-1', createdBy: { id: 'emp-1', name: 'E' } })

    await POST(makePost({
      teamId: 'team-1',
      type: 'GENERAL',
      body: 'x',
      dateFrom: '2027-01-01',
      dateTo: '2027-01-07',
      visibility: 'LEADERS',
    }, 'emp-1'))

    expect(mockPrisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: 'ALL' }),
      })
    )
  })

  it('honours a LEADERS visibility request from an ADMIN', async () => {
    mockPrisma.note.create.mockResolvedValue({ id: 'n-2', createdBy: { id: 'admin-1', name: 'A' } })

    await POST(makePost({
      teamId: 'team-1',
      type: 'GENERAL',
      body: 'x',
      dateFrom: '2027-01-01',
      dateTo: '2027-01-07',
      visibility: 'LEADERS',
    }, 'admin-1'))

    expect(mockPrisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: 'LEADERS' }),
      })
    )
  })

  it('creates note and notifies creator', async () => {
    mockPrisma.note.create.mockResolvedValue({
      id: 'note-1',
      teamId: 'team-1',
      createdByUserId: 'admin-1',
      type: 'HOLIDAY',
      status: 'PENDING',
      body: 'Ferie',
      dateFrom: '2027-01-01',
      dateTo: '2027-01-07',
      createdBy: { id: 'admin-1', name: 'Admin' },
    })

    const res = await POST(makePost({
      teamId: 'team-1',
      createdByUserId: 'admin-1',
      type: 'HOLIDAY',
      body: 'Ferie',
      dateFrom: '2027-01-01',
      dateTo: '2027-01-07',
    }, 'admin-1'))

    expect(res.status).toBe(200)
    expect(mockPrisma.note.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
  })
})
