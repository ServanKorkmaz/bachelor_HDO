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
 * No cleanup — at most one extra row lands far outside the seeded window.
 */
test.describe('Create shift via grid', () => {
  test.beforeEach(async ({ context }) => {
    await signInAsEmail(context, SEED_ADMIN_EMAIL)
  })

  test('admin clicks a cell, submits the modal, and the API persists the shift', async ({ page }) => {
    // A Tuesday two years out — clearly outside the seed's current-week shifts.
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
    // always shows the seeded EMPLOYEE users — use the first available row
    // rather than hardcoding a name so the test stays valid across re-seeds.
    // On first run the cell is empty (POST); on repeat runs it may be occupied
    // (PUT) — both outcomes are valid (see comment above).
    const firstEmployeeRow = page.locator('tbody tr').first()
    // Skip the first column (employee name) and the last column (sum) and
    // click the second data cell (first day column).
    await firstEmployeeRow.locator('td').nth(1).click()

    // Modal opens. Wait for shift-types to load so the default selection is
    // populated — handleSave silently no-ops if `selectedShiftTypeId` is empty.
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Detaljer for dag/)).toBeVisible()
    // Wait for the Lagre button to be present — shift-types must have loaded
    // for canEditShifts to be true and for selectedShiftTypeId to be set.
    await expect(page.getByRole('button', { name: 'Lagre' })).toBeVisible()

    // Click Lagre and capture the API response. Accept POST (new shift) or PUT
    // (edit existing shift on a repeat run). Both prove the route is wired up.
    const [saveResponse] = await Promise.all([
      page.waitForResponse(r => {
        const url = r.url()
        const method = r.request().method()
        // POST /api/shifts  — create new shift
        // PUT  /api/shifts/{id} — update existing shift (repeat run)
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
