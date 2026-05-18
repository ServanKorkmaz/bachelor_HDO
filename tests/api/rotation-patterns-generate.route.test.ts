import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
    rotationPattern: { findUnique: vi.fn() },
    shiftType: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/services/shift-service', () => ({
  createShift: vi.fn().mockImplementation(async (args: { userId: string; date: string }) => ({
    id: `s-${args.userId}-${args.date}`,
  })),
}))

import { POST } from '@/app/api/rotation-patterns/[id]/generate/route'

const LEADER = { id: 'leader-1', role: 'LEADER' }
const params = { id: 'rp-1' }

function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/rotation-patterns/rp-1/generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.user.findUnique.mockResolvedValue(LEADER)
  mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
  mockPrisma.shiftType.findMany.mockResolvedValue([
    { id: 't1', defaultStartTime: '08:00', defaultEndTime: '16:00', crossesMidnight: false },
  ])
})

describe('POST /api/rotation-patterns/[id]/generate', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await POST(makePost({ startMonday: '2026-06-01', weeks: 1 }), { params })
    expect(res.status).toBe(401)
  })

  it('returns 403 for EMPLOYEE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE' })
    const res = await POST(makePost({ startMonday: '2026-06-01', weeks: 1 }, 'emp-1'), { params })
    expect(res.status).toBe(403)
  })

  it('returns 404 when pattern not found', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue(null)
    const res = await POST(makePost({ startMonday: '2026-06-01', weeks: 1 }, 'leader-1'), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 when startMonday is not a Monday', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })
    const res = await POST(makePost({ startMonday: '2026-06-02', weeks: 1 }, 'leader-1'), { params })
    expect(res.status).toBe(400)
  })

  it('returns 200 with successes/failures shape on happy path', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1,
      slotsJson: JSON.stringify([
        { userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' },
      ]),
    })
    const res = await POST(makePost({ startMonday: '2026-06-01', weeks: 1 }, 'leader-1'), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('successes')
    expect(body).toHaveProperty('failures')
    expect(body.successes).toHaveLength(1)
  })
})
