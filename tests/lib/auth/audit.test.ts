import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}))

import { prisma } from '@/lib/prisma'
import { logAuthEvent, AUTH_EVENT, scrubDetails } from '@/lib/auth/audit'

describe('logAuthEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes a row with the given event as action and entityType "auth"', async () => {
    await logAuthEvent({ event: AUTH_EVENT.LOGIN_SUCCESS, actorUserId: 'user-1' })
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'LOGIN_SUCCESS',
        entityType: 'auth',
        actorUserId: 'user-1',
      }),
    })
  })

  it('uses sentinel "anonymous" when actorUserId is omitted', async () => {
    await logAuthEvent({ event: AUTH_EVENT.LOGIN_UNKNOWN_USER, details: { email: 'a@b.no' } })
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorUserId: 'anonymous' }),
    })
  })

  it('does not throw when prisma fails', async () => {
    ;(prisma.auditLog.create as any).mockRejectedValueOnce(new Error('db down'))
    await expect(logAuthEvent({ event: AUTH_EVENT.LOGIN_SUCCESS, actorUserId: 'u1' })).resolves.toBeUndefined()
  })
})

describe('scrubDetails', () => {
  it('drops keys matching token/secret/password/code (case-insensitive)', () => {
    const out = scrubDetails({
      tenant: 't',
      access_token: 'x',
      Secret: 'y',
      password: 'z',
      AUTH_CODE: 'c',
      kept: 'ok',
    })
    expect(out).toEqual({ tenant: 't', kept: 'ok' })
  })

  it('returns undefined for undefined input', () => {
    expect(scrubDetails(undefined)).toBeUndefined()
  })
})
