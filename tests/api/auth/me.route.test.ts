import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/auth/me/route'

describe('GET /api/auth/me', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('NODE_ENV', 'test') })

  it('returns 401 when no user is authenticated', async () => {
    const res = await GET(new Request('http://x/api/auth/me'))
    expect(res.status).toBe(401)
  })

  it('returns the user shape for an authenticated caller', async () => {
    // withAuth calls findUnique twice: once to validate the auth (select id+role)
    // and once for our handler (select full shape). Mock both to return the user.
    ;(prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1', name: 'Kari', email: 'k@hdo.no', role: 'EMPLOYEE', teamId: 't1',
    })
    const res = await GET(new Request('http://x/api/auth/me', {
      headers: { 'x-current-user-id': 'u1' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: 'u1', name: 'Kari', email: 'k@hdo.no', role: 'EMPLOYEE', teamId: 't1' })
  })
})
