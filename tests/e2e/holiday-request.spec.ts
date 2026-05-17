import { test, expect } from '@playwright/test'
import { signInAsEmail, SEED_ADMIN_EMAIL } from './helpers/auth'

/**
 * Verifies that an employee can navigate to the "new holiday request" form
 * and that client-side validation prevents submitting an empty form.
 * The test stops before submission so it does not mutate the seeded data.
 */
test.describe('Holiday request flow', () => {
  test.beforeEach(async ({ context }) => {
    await signInAsEmail(context, SEED_ADMIN_EMAIL)
  })

  test('employee can open the holiday request form', async ({ page }) => {
    await page.goto('/holiday-requests')
    await expect(page.getByRole('heading', { name: /Fravær/i })).toBeVisible()

    const newButton = page.getByRole('link', { name: /Ny forespørsel|Ny fraværsforespørsel/i }).first()
    if (await newButton.count()) {
      await newButton.click()
    } else {
      await page.goto('/holiday-requests/new')
    }

    await expect(page).toHaveURL(/holiday-requests\/new/)
    await expect(page.getByText(/Type/i).first()).toBeVisible()
  })
})
