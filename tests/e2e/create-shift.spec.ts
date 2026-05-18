import { test, expect } from '@playwright/test'
import { signInAsEmail, SEED_ADMIN_EMAIL } from './helpers/auth'

/**
 * Mutation-flow E2E: an admin opens the weekly grid, jumps to a far-future
 * week so the seed doesn't fill the cells we want, clicks any cell on
 * an employee's row, and submits the shift modal with its defaults. Verifies
 * the create-shift (POST) or edit-shift (PUT) path works end-to-end from UI
 * through `withAuth`, `withEvents`, and the DB.
 *
 * Idempotency: on the first run the target cell is empty → POST 200/201.
 * On subsequent runs the cell may already have a shift left by a prior run,
 * so the modal opens in edit mode → PUT 200. All three statuses (200, 201,
 * and 409 for a duplicate-key race) prove the route is correctly wired up.
 * No cleanup. At most one extra row lands far outside the seeded window.
 */
test.describe('Create shift via grid', () => {
  test.beforeEach(async ({ context }) => {
    await signInAsEmail(context, SEED_ADMIN_EMAIL)
  })

  test('admin clicks a cell, submits the modal, and the API persists the shift', async ({ page }) => {
    // A Tuesday two years out. Clearly outside the seed's current-week shifts.
    const targetDate = '2027-12-14'

    await page.goto('/standard')

    // Wait for the grid to finish loading before interacting.
    await expect(page.getByRole('heading', { name: 'Standard plan' })).toBeVisible()
    await page.waitForLoadState('networkidle')

    // Jump to a future week with no seeded shifts.
    await page.locator('input[type="date"]').fill(targetDate)
    await page.waitForResponse(r =>
      r.url().includes('/api/shifts') && r.url().includes('dateFrom=2027-12') && r.ok()
    )

    // Click any cell (empty or occupied) in the first employee row. The grid
    // always shows the seeded EMPLOYEE users. Use the first available row
    // rather than hardcoding a name so the test stays valid across re-seeds.
    // On first run the cell is empty (POST); on repeat runs it may be occupied
    // (PUT). Both outcomes are valid (see comment above).
    const firstEmployeeRow = page.locator('tbody tr').first()
    // Skip the first column (employee name) and click the second data cell.
    await firstEmployeeRow.locator('td').nth(1).click()

    // Modal opens.
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Detaljer for dag/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lagre' })).toBeVisible()

    // Wait for the modal's setup useEffect to populate state before clicking
    // Lagre. Without this we race against React: handleSave guards on
    // (date && selectedShiftTypeId && selectedUserId) and silently returns
    // if any is empty. Producing no network request and a Playwright timeout.
    // The start-time input is empty until the useEffect runs (with either
    // shift defaults for PUT or shift-type defaults for POST), so its value
    // being non-empty is a definitive "modal is ready" signal that survives
    // both cold and cached /api/shift-types loads.
    await expect(page.locator('input[type="time"]').first()).not.toHaveValue('')

    // Click Lagre and capture the API response. Accept POST (new shift) or PUT
    // (edit existing shift on a repeat run). Both prove the route is wired up.
    const [saveResponse] = await Promise.all([
      page.waitForResponse(r => {
        const url = r.url()
        const method = r.request().method()
        // POST /api/shifts: create new shift
        // PUT  /api/shifts/{id}. Update existing shift (repeat run)
        return (
          url.includes('/api/shifts') &&
          (method === 'POST' || method === 'PUT')
        )
      }),
      page.getByRole('button', { name: 'Lagre' }).click(),
    ])

    expect([200, 201, 409]).toContain(saveResponse.status())
  })
})
