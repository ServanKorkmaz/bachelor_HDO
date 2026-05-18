import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    weekNote: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, PUT } from '@/app/api/week-notes/route'

const TEAM = 'team-1'
const LEADER = 'user-leader'
const EMPLOYEE = 'user-employee'
const OTHER_EMPLOYEE = 'user-other'

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
  // Default: the actor is a leader on the requested team. Individual tests override.
  mockPrisma.user.findUnique.mockResolvedValue({ id: LEADER, role: 'LEADER' })
  mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
})

describe('GET /api/week-notes', () => {
  it('returns the list of notes for the requested employee + ISO-week range', async () => {
    mockPrisma.weekNote.findMany.mockResolvedValue([
      { id: 'n1', teamId: TEAM, userId: EMPLOYEE, isoYear: 2026, isoWeek: 11, body: 'Fokus på overvåkning' },
    ])

    const res = await GET(makeGet({
      teamId: TEAM,
      userId: EMPLOYEE,
      fromYear: '2026',
      fromWeek: '10',
      toYear: '2026',
      toWeek: '13',
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      expect.objectContaining({ isoWeek: 11, userId: EMPLOYEE, body: 'Fokus på overvåkning' }),
    ])
    expect(mockPrisma.weekNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: TEAM, userId: EMPLOYEE }),
      }),
    )
  })

  it('rejects requests with missing query params', async () => {
    const res = await GET(makeGet({ teamId: TEAM }))
    expect(res.status).toBe(400)
    expect(mockPrisma.weekNote.findMany).not.toHaveBeenCalled()
  })

  it('forbids an EMPLOYEE from reading another employee\'s notes', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: EMPLOYEE, role: 'EMPLOYEE' })

    const res = await GET(makeGet({
      teamId: TEAM,
      userId: OTHER_EMPLOYEE,
      fromYear: '2026',
      fromWeek: '10',
      toYear: '2026',
      toWeek: '13',
    }, EMPLOYEE))
    expect(res.status).toBe(403)
    expect(mockPrisma.weekNote.findMany).not.toHaveBeenCalled()
  })

  it('allows an EMPLOYEE to read their own notes', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: EMPLOYEE, role: 'EMPLOYEE' })
    mockPrisma.weekNote.findMany.mockResolvedValue([])

    const res = await GET(makeGet({
      teamId: TEAM,
      userId: EMPLOYEE,
      fromYear: '2026',
      fromWeek: '10',
      toYear: '2026',
      toWeek: '13',
    }, EMPLOYEE))
    expect(res.status).toBe(200)
    expect(mockPrisma.weekNote.findMany).toHaveBeenCalled()
  })
})

describe('PUT /api/week-notes', () => {
  it('upserts a note when body is non-empty and trims surrounding whitespace', async () => {
    mockPrisma.weekNote.upsert.mockResolvedValue({
      id: 'n1',
      teamId: TEAM,
      userId: EMPLOYEE,
      isoYear: 2026,
      isoWeek: 11,
      body: 'Fokus på overvåkning',
    })

    const res = await PUT(makePut({
      teamId: TEAM,
      userId: EMPLOYEE,
      isoYear: 2026,
      isoWeek: 11,
      body: '  Fokus på overvåkning  ',
    }))
    expect(res.status).toBe(200)
    expect(mockPrisma.weekNote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          body: 'Fokus på overvåkning',
          userId: EMPLOYEE,
          createdBy: LEADER,
        }),
        update: expect.objectContaining({ body: 'Fokus på overvåkning' }),
      }),
    )
  })

  it('deletes the note when body is empty (single-method upsert contract)', async () => {
    mockPrisma.weekNote.deleteMany.mockResolvedValue({ count: 1 })

    const res = await PUT(makePut({
      teamId: TEAM,
      userId: EMPLOYEE,
      isoYear: 2026,
      isoWeek: 11,
      body: '',
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
    expect(mockPrisma.weekNote.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: TEAM, userId: EMPLOYEE }),
      }),
    )
    expect(mockPrisma.weekNote.upsert).not.toHaveBeenCalled()
  })

  it('allows an EMPLOYEE to upsert their own week note', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: EMPLOYEE, role: 'EMPLOYEE' })
    mockPrisma.weekNote.upsert.mockResolvedValue({
      id: 'n1',
      teamId: TEAM,
      userId: EMPLOYEE,
      isoYear: 2026,
      isoWeek: 11,
      body: 'Egen plan',
    })

    const res = await PUT(makePut({
      teamId: TEAM,
      userId: EMPLOYEE,
      isoYear: 2026,
      isoWeek: 11,
      body: 'Egen plan',
    }, EMPLOYEE))
    expect(res.status).toBe(200)
    expect(mockPrisma.weekNote.upsert).toHaveBeenCalled()
  })

  it('forbids an EMPLOYEE from writing another employee\'s note', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: EMPLOYEE, role: 'EMPLOYEE' })

    const res = await PUT(makePut({
      teamId: TEAM,
      userId: OTHER_EMPLOYEE,
      isoYear: 2026,
      isoWeek: 11,
      body: 'Ikke lov',
    }, EMPLOYEE))
    expect(res.status).toBe(403)
    expect(mockPrisma.weekNote.upsert).not.toHaveBeenCalled()
  })

  it('rejects invalid ISO week numbers', async () => {
    const res = await PUT(makePut({
      teamId: TEAM,
      userId: EMPLOYEE,
      isoYear: 2026,
      isoWeek: 54, // > 53
      body: 'Test',
    }))
    expect(res.status).toBe(400)
    expect(mockPrisma.weekNote.upsert).not.toHaveBeenCalled()
  })
})
