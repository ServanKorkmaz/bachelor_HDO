import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signInAsEmail, SEED_ADMIN_EMAIL } from './helpers/auth'

/**
 * Axe-core sweep across the main authenticated pages.
 *
 * Each test runs in its own context with `reducedMotion: 'reduce'` so axe
 * samples final colors instead of mid-animation opacities (which inflate
 * perceived contrast on small text and produce false positives).
 *
 * Scope: WCAG 2.1 AA. The legal bar for Norwegian public-sector apps
 * (Forskrift om universell utforming). We disable two rules by default:
 *
 *   - `region`: triggers on any content not wrapped in a landmark; legitimate
 *     concern but our header/nav/main structure satisfies it at the page
 *     level. False positives come from third-party dropdown portals.
 *   - `landmark-unique`: complains when more than one <nav> exists; we use
 *     a single primary nav and Radix-rendered popovers don't actually nest.
 *
 * Anything else that fires is a real issue and must be fixed in source,
 * not silenced here.
 */

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const DISABLED_RULES: string[] = []

async function scan(page: Page) {
  const builder = new AxeBuilder({ page }).withTags(A11Y_TAGS)
  if (DISABLED_RULES.length > 0) builder.disableRules(DISABLED_RULES)
  return builder.analyze()
}

async function gotoAuthenticated(browser: import('@playwright/test').Browser, path: string) {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  await signInAsEmail(context, SEED_ADMIN_EMAIL)
  const page = await context.newPage()
  await page.goto(path)
  // Wait for client-side queries (UserMenu's /api/auth/me, page data) to settle.
  await page.waitForLoadState('networkidle')
  return { page, context }
}

test.describe('Accessibility (WCAG 2.1 AA)', () => {
  test('/standard has zero a11y violations', async ({ browser }) => {
    const { page, context } = await gotoAuthenticated(browser, '/standard')
    const results = await scan(page)
    expect(results.violations).toEqual([])
    await context.close()
  })

  test('/month has zero a11y violations', async ({ browser }) => {
    const { page, context } = await gotoAuthenticated(browser, '/month')
    const results = await scan(page)
    expect(results.violations).toEqual([])
    await context.close()
  })

  test('/agenda has zero a11y violations', async ({ browser }) => {
    const { page, context } = await gotoAuthenticated(browser, '/agenda')
    const results = await scan(page)
    expect(results.violations).toEqual([])
    await context.close()
  })

  test('/swap has zero a11y violations', async ({ browser }) => {
    const { page, context } = await gotoAuthenticated(browser, '/swap')
    const results = await scan(page)
    expect(results.violations).toEqual([])
    await context.close()
  })

  test('/holiday-requests has zero a11y violations', async ({ browser }) => {
    const { page, context } = await gotoAuthenticated(browser, '/holiday-requests')
    const results = await scan(page)
    expect(results.violations).toEqual([])
    await context.close()
  })

  test('/admin has zero a11y violations', async ({ browser }) => {
    const { page, context } = await gotoAuthenticated(browser, '/admin')
    const results = await scan(page)
    expect(results.violations).toEqual([])
    await context.close()
  })

  test('/settings has zero a11y violations', async ({ browser }) => {
    const { page, context } = await gotoAuthenticated(browser, '/settings')
    const results = await scan(page)
    expect(results.violations).toEqual([])
    await context.close()
  })
})
