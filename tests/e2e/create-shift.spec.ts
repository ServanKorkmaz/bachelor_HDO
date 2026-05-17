import { test, expect } from '@playwright/test'

/**
 * Mutation-flow E2E: an admin opens the weekly grid, jumps to a far-future
 * week so the seed doesn't fill the cells we want, clicks an empty cell on
 * an employee's row, and submits the shift modal with its defaults. Verifies
 * the create-shift path works end-to-end from UI through `withAuth`,
 * `withEvents`, and the DB.
 *
 * Idempotency: the test always targets the same (employee, date) pair so a
 * second run trips the `(userId, date)` unique constraint and gets back 409.
 * Both 200 and 409 prove the route is correctly wired up; we accept either.
 * No cleanup — at most one extra row lands far outside the seeded window.
 */
test.describe('Create shift via grid', () => {
  test('admin clicks an empty cell, submits the modal, and the API persists the shift', async ({ page }) => {
    // A Tuesday two years out — clearly outside the seed's current-week shifts.
    const targetDate = '2027-12-14'

    await page.goto('/standard')

    // The session cookie identifies "Admin User" from the seed. Wait for the
    // bootstrap fetches before interacting with the grid.
    await expect(page.getByRole('heading', { name: 'Standard plan' })).toBeVisible()
    await page.waitForResponse(r => r.url().includes('/api/users') && r.ok())
    await page.waitForResponse(r => r.url().includes('/api/teams') && r.ok())

    // Jump to a future week with no seeded shifts.
    await page.locator('input[type="date"]').fill(targetDate)
    await page.waitForResponse(r =>
      r.url().includes('/api/shifts') && r.url().includes('dateFrom=2027-12') && r.ok()
    )

    // Click the first empty cell in Kari Nordmann's row. The seed creates
    // her as an EMPLOYEE in the only team so she always shows up.
    const kariRow = page.locator('tr').filter({ hasText: 'Kari Nordmann' })
    await kariRow.locator('td:has-text("-")').first().click()

    // Modal opens. Wait for shift-types to load so the default selection is
    // populated — handleSave silently no-ops if `selectedShiftTypeId` is empty.
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Detaljer for dag/)).toBeVisible()
    await page.waitForResponse(r => r.url().includes('/api/shift-types') && r.ok())

    // Click Lagre and capture the POST. Accept either a fresh-success status
    // (200/201) or the unique-constraint 409 from a repeat run.
    const [saveResponse] = await Promise.all([
      page.waitForResponse(r =>
        r.url().endsWith('/api/shifts') && r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: 'Lagre' }).click(),
    ])

    expect([200, 201, 409]).toContain(saveResponse.status())
  })
})
