import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'crypto'

describe('lib/auth/azureAd', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.AZURE_TENANT_ID = '2fa3d13b-cb75-4f29-bf34-f17a7578c041'
    process.env.AZURE_CLIENT_ID = 'bad829ef-851f-43e6-8d5b-55ae7b9106e8'
    process.env.AZURE_CLIENT_SECRET = 'test-secret-value'
    process.env.AZURE_REDIRECT_URI = 'http://localhost:4000/api/auth/azure/callback'
  })

  it('throws at import-time when AZURE_TENANT_ID is missing', async () => {
    vi.resetModules()
    delete process.env.AZURE_TENANT_ID
    await expect(import('@/lib/auth/azureAd')).rejects.toThrow(/AZURE_TENANT_ID/)
  })

  it('buildAuthCodeUrl returns a url + verifier + state', async () => {
    const { buildAuthCodeUrl } = await import('@/lib/auth/azureAd')
    const { url, verifier, state } = await buildAuthCodeUrl()
    expect(url).toMatch(/login\.microsoftonline\.com/)
    expect(url).toContain('code_challenge_method=S256')
    expect(url).toContain(`client_id=${encodeURIComponent(process.env.AZURE_CLIENT_ID!)}`)
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(/^[A-Za-z0-9_-]+$/.test(verifier)).toBe(true)
    expect(state.length).toBeGreaterThanOrEqual(32)
    expect(/^[A-Za-z0-9_-]+$/.test(state)).toBe(true)
  })

  it('the generated code_challenge equals base64url(sha256(verifier))', async () => {
    const { buildAuthCodeUrl } = await import('@/lib/auth/azureAd')
    const { url, verifier } = await buildAuthCodeUrl()
    const parsed = new URL(url)
    const challenge = parsed.searchParams.get('code_challenge')!
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })
})
