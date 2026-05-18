import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E tests run against a local Next.js dev server backed by the
 * seeded Neon database. Run `npm run db:seed` before the first run to ensure
 * the expected fixtures exist.
 */

// tests/e2e/helpers/auth.ts imports lib/auth/session.ts, which throws at
// module load when SESSION_COOKIE_SECRET is missing (production-safety guard).
// Setting it here makes `npx playwright test` work the same as `npm run test:e2e`
// — the runner inherits this process env and so do the worker processes.
// The same value must be passed to the dev server via the webServer command
// below so the cookies the helper mints are unsealable by the server.
process.env.SESSION_COOKIE_SECRET ??= 'a'.repeat(32)
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx cross-env NODE_ENV=test SESSION_COOKIE_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa AZURE_TENANT_ID=test-tenant AZURE_CLIENT_ID=test-client-id AZURE_CLIENT_SECRET=test-secret AZURE_REDIRECT_URI=http://localhost:4000/auth/azure/callback npm run dev',
        url: 'http://localhost:4000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
