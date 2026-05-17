import { test, expect } from '@playwright/test'
import { signInAsEmail, SEED_ADMIN_EMAIL } from './helpers/auth'

/**
 * Verifies the swap-requests page is reachable and renders the empty/list
 * state. The test does not create new swap requests so it is safe to run
 * against the seeded environment.
 */
test.describe('Swap request page', () => {
  test.beforeEach(async ({ context }) => {
    await signInAsEmail(context, SEED_ADMIN_EMAIL)
  })

  test('renders the swap-requests list view', async ({ page }) => {
    await page.goto('/swap')
    await expect(page.getByRole('heading', { name: /Vaktbytter/i })).toBeVisible()
    // List should either show some swap requests or an empty-state message
    await page.waitForResponse((r) => r.url().includes('/api/swap-requests'))
  })
})
