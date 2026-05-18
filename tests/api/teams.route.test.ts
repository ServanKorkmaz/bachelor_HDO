import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    team:                  { findMany: vi.fn(), create: vi.fn() },
    notificationSettings:  { create: vi.fn() },
    user:                  { findUnique: vi.fn() },
    auditLog:              { create: vi.fn() },
    $transaction:          vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, POST } from '@/app/api/teams/route'

/** Builds a GET request optionally signed by `userId`. */
function makeGet(userId?: string): Request {
  return new Request('http://localhost/api/teams', {
    headers: userId ? { 'x-current-user-id': userId } : {},
  })
}

/** Builds a JSON POST request optionally signed by `userId`. */
function makePost(body: unknown, userId?: string): Request {
  return new Request('http://localhost/api/teams', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-current-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  })
}

const ADMIN_USER = { id: 'admin-1', role: 'ADMIN' }
const EMPLOYEE_USER = { id: 'emp-1', role: 'EMPLOYEE' }

describe('GET /api/teams', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when caller is not authenticated', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('returns every team for an ADMIN caller', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockPrisma.team.findMany.mockResolvedValue([{ id: 'team-1', name: 'Team A' }])

    const res = await GET(makeGet('admin-1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    )
    const callArgs = mockPrisma.team.findMany.mock.calls[0][0]
    expect(callArgs).not.toHaveProperty('where')
  })

  it('scopes the result to team memberships for a non-admin caller', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(EMPLOYEE_USER)
    mockPrisma.team.findMany.mockResolvedValue([])

    await GET(makeGet('emp-1'))

    expect(mockPrisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberships: { some: { userId: 'emp-1', status: 'active' } },
        }),
      }),
    )
  })
})

describe('POST /api/teams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
  })

  it('returns 401 when caller is not authenticated', async () => {
    const res = await POST(makePost({ name: 'Nytt team' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not an admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(EMPLOYEE_USER)
    const res = await POST(makePost({ name: 'Nytt team' }, 'emp-1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when name is empty', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    const res = await POST(makePost({ name: '' }, 'admin-1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.team.create).not.toHaveBeenCalled()
  })

  it('creates team + default notification settings + audit entry atomically', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(ADMIN_USER)
    mockPrisma.team.create.mockResolvedValue({ id: 'team-new', name: 'Akuttmottak' })
    mockPrisma.notificationSettings.create.mockResolvedValue({})

    const res = await POST(makePost({ name: 'Akuttmottak' }, 'admin-1'))

    expect(res.status).toBe(200)
    expect(mockPrisma.team.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notificationSettings.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamId: 'team-new', emailEnabled: true, smsEndpoint: null }),
      }),
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'TEAM_CREATED',
          entityType: 'team',
          entityId: 'team-new',
          afterJson: expect.stringContaining('"name":"Akuttmottak"'),
        }),
      }),
    )
  })
})
