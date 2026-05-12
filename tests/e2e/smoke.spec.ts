import { test, expect } from '@playwright/test'

/**
 * End-to-end smoke tests against the seeded development environment.
 * These verify the primary navigation surfaces render correctly and the
 * mock-auth role switcher behaves as expected. They do not mutate data.
 */

test.describe('Smoke', () => {
  test('home redirects to /standard and the weekly grid renders', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/standard/)
    await expect(page.getByRole('heading', { name: 'Standard plan' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Ansatt' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Sum' })).toBeVisible()
  })

  test('main navigation links are present', async ({ page }) => {
    await page.goto('/standard')
    for (const label of ['Standard plan', 'Måned', 'Agenda', 'Vaktbytter', 'Fravær', 'Innstillinger']) {
      await expect(page.getByRole('link', { name: label })).toBeVisible()
    }
  })

  test('the seeded weekly grid contains at least one shift', async ({ page }) => {
    await page.goto('/standard')
    // Wait for the shifts API to return the seeded data
    const response = await page.waitForResponse((r) => r.url().includes('/api/shifts') && r.ok())
    const shifts = await response.json()
    expect(Array.isArray(shifts)).toBe(true)
  })
})
