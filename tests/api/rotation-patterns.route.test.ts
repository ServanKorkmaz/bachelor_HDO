import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    teamMembership: { findFirst: vi.fn(), findMany: vi.fn() },
    rotationPattern: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    shiftType: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, POST } from '@/app/api/rotation-patterns/route'
import {
  GET as getOne,
  PUT,
  DELETE,
} from '@/app/api/rotation-patterns/[id]/route'

const params = { id: 'rp-1' }

function makeGet(params: Record<string, string> = {}, userId?: string): Request {
  const url = new URL('http://localhost/api/rotation-patterns')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/rotation-patterns', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

const LEADER = { id: 'leader-1', role: 'LEADER' }

describe('GET /api/rotation-patterns', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const res = await GET(makeGet({ teamId: 'team-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when teamId is missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    const res = await GET(makeGet({}, 'leader-1'))
    expect(res.status).toBe(400)
  })

  it('returns list of patterns for an authenticated team member', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    mockPrisma.rotationPattern.findMany.mockResolvedValue([
      { id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]' },
    ])
    const res = await GET(makeGet({ teamId: 'team-1' }, 'leader-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })
})

describe('POST /api/rotation-patterns', () => {
  const validBody = {
    teamId: 'team-1',
    name: 'Helse 3-ukers',
    weeks: 1,
    slots: [{ userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma)
    )
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }])
    mockPrisma.shiftType.findMany.mockResolvedValue([{ id: 't1' }])
    mockPrisma.teamMembership.findMany.mockResolvedValue([
      { userId: 'u1', teamId: 'team-1', status: 'active' },
    ])
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    mockPrisma.rotationPattern.create.mockResolvedValue({
      id: 'rp-1', ...validBody, slotsJson: JSON.stringify(validBody.slots),
    })
  })

  it('returns 401 when not authenticated', async () => {
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 403 for an EMPLOYEE caller', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE' })
    const res = await POST(makePost(validBody, 'emp-1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid body', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    const res = await POST(makePost({ teamId: 'team-1' }, 'leader-1'))
    expect(res.status).toBe(400)
  })

  it('creates pattern for LEADER and returns 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    const res = await POST(makePost(validBody, 'leader-1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.rotationPattern.create).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/rotation-patterns/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
  })

  it('returns 404 when pattern does not exist', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue(null)
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      headers: { 'x-current-user-id': 'leader-1' },
    })
    const res = await getOne(req, { params })
    expect(res.status).toBe(404)
  })

  it('returns the pattern when found', async () => {
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      headers: { 'x-current-user-id': 'leader-1' },
    })
    const res = await getOne(req, { params })
    expect(res.status).toBe(200)
  })
})

describe('PUT /api/rotation-patterns/[id]', () => {
  const validBody = {
    teamId: 'team-1',
    name: 'Updated',
    weeks: 1,
    slots: [{ userId: 'u1', weekIndex: 0, dayOfWeek: 1, shiftTypeId: 't1' }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma)
    )
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }])
    mockPrisma.shiftType.findMany.mockResolvedValue([{ id: 't1' }])
    mockPrisma.teamMembership.findMany.mockResolvedValue([
      { userId: 'u1', teamId: 'team-1', status: 'active' },
    ])
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'Old', weeks: 1, slotsJson: '[]',
    })
    mockPrisma.rotationPattern.update.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'Updated', weeks: 1,
      slotsJson: JSON.stringify(validBody.slots),
    })
  })

  it('returns 400 for invalid body', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-current-user-id': 'leader-1' },
      body: JSON.stringify({ teamId: 'team-1' }),
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it('updates pattern for LEADER and returns 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-current-user-id': 'leader-1' },
      body: JSON.stringify(validBody),
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    expect(mockPrisma.rotationPattern.update).toHaveBeenCalledTimes(1)
  })
})

describe('DELETE /api/rotation-patterns/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma)
    )
  })

  it('returns 403 for EMPLOYEE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE' })
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      method: 'DELETE',
      headers: { 'x-current-user-id': 'emp-1' },
    })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(403)
  })

  it('deletes pattern for LEADER and returns 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(LEADER)
    mockPrisma.rotationPattern.findUnique.mockResolvedValue({
      id: 'rp-1', teamId: 'team-1', name: 'X', weeks: 1, slotsJson: '[]',
    })
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: 'm-1' })
    mockPrisma.rotationPattern.delete.mockResolvedValue({})
    const req = new Request('http://localhost/api/rotation-patterns/rp-1', {
      method: 'DELETE',
      headers: { 'x-current-user-id': 'leader-1' },
    })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(200)
  })
})
