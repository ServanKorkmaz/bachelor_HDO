import { describe, expect, it } from 'vitest'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'

/**
 * Verifies the priority order for resolving the current user ID:
 * x-current-user-id header → currentUserId query param → JSON body → null.
 */
describe('getCurrentUserId', () => {
  it('reads user ID from header first', async () => {
    const req = new Request('http://localhost/api/test?currentUserId=query-user', {
      headers: { 'x-current-user-id': 'header-user' },
    })

    await expect(getCurrentUserId(req)).resolves.toBe('header-user')
  })

  it('falls back to query parameter', async () => {
    const req = new Request('http://localhost/api/test?currentUserId=query-user')
    await expect(getCurrentUserId(req)).resolves.toBe('query-user')
  })

  it('falls back to JSON body currentUserId', async () => {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentUserId: 'body-user' }),
    })

    await expect(getCurrentUserId(req)).resolves.toBe('body-user')
  })

  it('returns null when no value is found', async () => {
    const req = new Request('http://localhost/api/test')
    await expect(getCurrentUserId(req)).resolves.toBeNull()
  })
})
