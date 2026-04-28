import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      create:     vi.fn(),
    },
    team:           { findUnique: vi.fn() },
    teamMembership: { create: vi.fn() },
    auditLog:       { create: vi.fn() },
    $transaction:   vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, POST } from '@/app/api/admin/users/route'

/** Builds a GET request with an optional x-current-user-id header and query params. */
function makeGet(userId?: string, params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/admin/users')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

/** Builds a JSON POST request with an optional x-current-user-id header. */
function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/admin/users', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

const adminUser = { id: 'admin-1', role: 'ADMIN' }

const validPayload = {
  name: 'Alice',
  email: 'alice@example.com',
  teamId: 'team-1',
  role: 'EMPLOYEE',
}

/** Tests for GET /api/admin/users. */
describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
  })

  it('returns 401 when currentUserId is missing', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not ADMIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'EMPLOYEE' })
    const res = await GET(makeGet('user-1'))
    expect(res.status).toBe(403)
  })

  it('returns list of users as admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(adminUser)
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        status: 'active',
        teamMemberships: [{ id: 'm-1', teamId: 'team-1', role: 'EMPLOYEE', team: { id: 'team-1', name: 'Team A' } }],
        team: null,
        createdAt: new Date(),
        lastLoginAt: null,
      },
    ])

    const res = await GET(makeGet('admin-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('user-1')
  })
})

/** Tests for POST /api/admin/users. */
describe('POST /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
    mockPrisma.teamMembership.create.mockResolvedValue({})
    mockPrisma.auditLog.create.mockResolvedValue({})
  })

  it('returns 401 when currentUserId is missing', async () => {
    const res = await POST(makePost(validPayload))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid payload', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(adminUser)

    const res = await POST(makePost({ name: '', email: 'not-email', teamId: '', role: 'INVALID' }, 'admin-1'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when team does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(adminUser)
    mockPrisma.team.findUnique.mockResolvedValue(null)

    const res = await POST(makePost(validPayload, 'admin-1'))
    expect(res.status).toBe(404)
  })

  it('returns 409 when email is already in use', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(adminUser)             // auth check
      .mockResolvedValueOnce({ id: 'existing-1' })  // email conflict
    mockPrisma.team.findUnique.mockResolvedValue({ id: 'team-1', name: 'Team A' })

    const res = await POST(makePost(validPayload, 'admin-1'))
    expect(res.status).toBe(409)
  })

  it('creates user, membership, and audit log as admin', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(adminUser) // auth check
      .mockResolvedValueOnce(null)      // email not taken
    mockPrisma.team.findUnique.mockResolvedValue({ id: 'team-1', name: 'Team A' })
    mockPrisma.user.create.mockResolvedValue({ id: 'new-1', ...validPayload })

    const res = await POST(makePost(validPayload, 'admin-1'))

    expect(res.status).toBe(200)
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.teamMembership.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1)
  })
})
