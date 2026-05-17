import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signInAsEmail, SEED_ADMIN_EMAIL } from './helpers/auth'

test.describe('Authentication', () => {
  test('unauthenticated /standard redirects to /login with preserved from=', async ({ page }) => {
    await page.goto('/standard')
    expect(page.url()).toContain('/login')
    expect(page.url()).toContain('from=%2Fstandard')
  })

  test('/login renders the sign-in button and is keyboard accessible', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Logg inn' })).toBeVisible()
    const button = page.getByRole('link', { name: 'Logg inn med Microsoft' })
    await expect(button).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(button).toBeFocused()
  })

  test('/login passes axe-core with zero violations', async ({ browser }) => {
    // Force reduced-motion so the card fade-in animation is skipped and axe
    // samples final colors (mid-animation opacity inflates the perceived
    // contrast of small text and produces false-positive violations).
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/login')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
    await context.close()
  })

  test('clicking sign-in starts the OAuth flow (302 to Microsoft)', async ({ page }) => {
    await page.goto('/login')
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/auth/azure/login')),
      page.getByRole('link', { name: 'Logg inn med Microsoft' }).click(),
    ])
    expect([302, 307]).toContain(response.status())
    expect(response.headers()['location']).toContain('login.microsoftonline.com')
  })

  test('authenticated user sees the UserMenu and can log out', async ({ page, context }) => {
    await signInAsEmail(context, SEED_ADMIN_EMAIL)
    await page.goto('/standard')
    await expect(page.getByRole('heading', { name: 'Standard plan' })).toBeVisible()
    const logoutButton = page.getByRole('button', { name: 'Logg ut' })
    await expect(logoutButton).toBeVisible()
    await logoutButton.click()
    await expect(page).toHaveURL(/\/login/)
  })
})
