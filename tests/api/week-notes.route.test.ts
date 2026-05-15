import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    weekNote: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, PUT } from '@/app/api/week-notes/route'

const TEAM = 'team-1'
const LEADER = 'user-leader'
const EMPLOYEE = 'user-employee'

function makeGet(params: Record<string, string>, userId = LEADER): Request {
  const url = new URL('http://localhost/api/week-notes')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString(), { headers: { 'x-current-user-id': userId } })
}

function makePut(body: unknown, userId = LEADER): Request {
  return new Request('http://localhost/api/week-notes', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-current-user-id': userId },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: the actor is a leader. Individual tests override.
  mockPrisma.user.findUnique.mockResolvedValue({ id: LEADER, role: 'LEADER' })
})

describe('GET /api/week-notes', () => {
  it('returns the list of notes for the requested ISO-week range', async () => {
    mockPrisma.weekNote.findMany.mockResolvedValue([
      { id: 'n1', teamId: TEAM, isoYear: 2026, isoWeek: 11, body: 'Fokus på overvåkning' },
    ])

    const res = await GET(makeGet({
      teamId: TEAM,
      fromYear: '2026',
      fromWeek: '10',
      toYear: '2026',
      toWeek: '13',
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      expect.objectContaining({ isoWeek: 11, body: 'Fokus på overvåkning' }),
    ])
    expect(mockPrisma.weekNote.findMany).toHaveBeenCalledTimes(1)
  })

  it('rejects requests with missing query params', async () => {
    const res = await GET(makeGet({ teamId: TEAM }))
    expect(res.status).toBe(400)
    expect(mockPrisma.weekNote.findMany).not.toHaveBeenCalled()
  })
})

describe('PUT /api/week-notes', () => {
  it('upserts a note when body is non-empty and trims surrounding whitespace', async () => {
    mockPrisma.weekNote.upsert.mockResolvedValue({
      id: 'n1',
      teamId: TEAM,
      isoYear: 2026,
      isoWeek: 11,
      body: 'Fokus på overvåkning',
    })

    const res = await PUT(makePut({
      teamId: TEAM,
      isoYear: 2026,
      isoWeek: 11,
      body: '  Fokus på overvåkning  ',
    }))
    expect(res.status).toBe(200)
    expect(mockPrisma.weekNote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ body: 'Fokus på overvåkning', createdBy: LEADER }),
        update: expect.objectContaining({ body: 'Fokus på overvåkning' }),
      }),
    )
  })

  it('deletes the note when body is empty (single-method upsert contract)', async () => {
    mockPrisma.weekNote.deleteMany.mockResolvedValue({ count: 1 })

    const res = await PUT(makePut({
      teamId: TEAM,
      isoYear: 2026,
      isoWeek: 11,
      body: '',
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
    expect(mockPrisma.weekNote.deleteMany).toHaveBeenCalled()
    expect(mockPrisma.weekNote.upsert).not.toHaveBeenCalled()
  })

  it('rejects employees (LEADER/ADMIN only)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: EMPLOYEE, role: 'EMPLOYEE' })

    const res = await PUT(makePut({
      teamId: TEAM,
      isoYear: 2026,
      isoWeek: 11,
      body: 'Test',
    }, EMPLOYEE))
    expect(res.status).toBe(403)
    expect(mockPrisma.weekNote.upsert).not.toHaveBeenCalled()
  })

  it('rejects invalid ISO week numbers', async () => {
    const res = await PUT(makePut({
      teamId: TEAM,
      isoYear: 2026,
      isoWeek: 54, // > 53
      body: 'Test',
    }))
    expect(res.status).toBe(400)
    expect(mockPrisma.weekNote.upsert).not.toHaveBeenCalled()
  })
})
