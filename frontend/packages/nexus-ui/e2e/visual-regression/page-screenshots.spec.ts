/**
 * Full-page visual regression tests.
 *
 * Crawls every route in the page registry and takes a deterministic screenshot.
 * Accessibility scanning is handled separately in accessibility.spec.ts.
 *
 * Usage:
 *   Generate baselines:  npx playwright test page-screenshots --update-snapshots
 *   Compare baselines:   npx playwright test page-screenshots
 *
 * NOTE: This spec does NOT use the `app` fixture so that `page.clock` can be
 * set after login, freezing timestamps for deterministic output.
 */
import { expect, test } from '@playwright/test'

import { VISUAL_REGRESSION_CLOCK } from '../../playwright.config'
import { appBaseUrl, toAppUrl } from '../fixtures'
import { isSkipWebServerForPlaywrightTests } from '../playwrightWebServerEnv'

import { loginPages, pages } from './page-registry'
import { assertPerceptualScreenshot } from './perceptualScreenshot'
import { stabilizeReactFlowViewport } from './stabilizeViewport'

const SCREENSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.005,
  animations: 'disabled' as const,
  fullPage: true,
}

// Run tests sequentially but don't stop on failure — critical for first-time
// baseline generation where every test "fails" (no snapshot to compare against)
test.describe.configure({ mode: 'default' })

test.describe('Page screenshots', { tag: '@local-only' }, () => {
  // Baselines require the mock API with known seed data; skip when running
  // against a real backend (the E2E workflow sets NEXUS_E2E_SKIP_WEB_SERVER=1).
  // The Visual Regression manual workflow uses the mock API, so CI=true
  // alone is not a valid skip condition.
  test.skip(
    isSkipWebServerForPlaywrightTests(),
    'Page screenshot baselines require mock API seed data; skipped in real-backend E2E runs'
  )

  // Canvas pages must use perceptual comparison to avoid flaky layout-shift diffs.
  // The CanvasPageEntry type enforces this for dedicated arrays (builderInteractivePages,
  // workflowDialogPages), but inline entries in the `pages` array need a runtime check.
  const missingPerceptual = pages.filter((e) => e.section === 'workflows' && !e.perceptual).map((e) => e.name)
  if (missingPerceptual.length > 0) {
    throw new Error(`Workflow entries must have perceptual: true — missing on: ${missingPerceptual.join(', ')}`)
  }

  for (const entry of pages) {
    test(`${entry.section}/${entry.name}`, async ({ page }) => {
      // For role-specific entries, intercept auth to return a role-scoped token
      if (entry.role) {
        await page.route('**/api/v1/auth/refresh', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              access_token: `mock-token-${entry.role}`,
              token_type: 'bearer',
              expires_in: 3600,
            }),
          })
        )
      }

      // Login — navigating to the base URL auto-authenticates with the mock API
      await page.goto(appBaseUrl)
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()

      await page.clock.setFixedTime(new Date(VISUAL_REGRESSION_CLOCK))

      // Clear persisted project-selector state so every screenshot starts from
      // the same "All projects" baseline regardless of test ordering.
      await page.evaluate(() => localStorage.removeItem('nexus-selected-project'))

      // Navigate to the target page
      await page.goto(toAppUrl(entry.path))

      // Wait for page-specific content to load
      await entry.waitFor(page)

      // Optional setup (e.g., pages needing interaction before screenshot)
      if (entry.setup) {
        await entry.setup(page)
      }

      // Wait for all network requests to settle before taking the screenshot
      await page.waitForLoadState('networkidle')

      // Remove focus from any active element to avoid flaky focus-ring diffs
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      })

      // Snap React Flow viewport to integer pixels (no-op for non-canvas pages)
      await stabilizeReactFlowViewport(page)

      // Screenshot with section-based directory organization
      const snapshotName = [entry.section, `${entry.name}.png`]
      if (entry.perceptual) {
        await assertPerceptualScreenshot(page, test.info(), snapshotName, entry.maxDiffPixelRatio)
      } else {
        const options = entry.maxDiffPixelRatio
          ? { ...SCREENSHOT_OPTIONS, maxDiffPixelRatio: entry.maxDiffPixelRatio }
          : SCREENSHOT_OPTIONS
        await expect(page).toHaveScreenshot(snapshotName, options)
      }
    })
  }
})

test.describe('Login page screenshots', { tag: '@local-only' }, () => {
  test.skip(
    isSkipWebServerForPlaywrightTests(),
    'Login page baselines require mock API seed data; skipped in real-backend E2E runs'
  )

  for (const entry of loginPages) {
    test(`${entry.section}/${entry.name}`, async ({ page }) => {
      // Block token refresh so the app shows the login page instead of auto-authenticating
      await page.route('**/api/v1/auth/refresh', (route) =>
        route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Unauthorized"}' })
      )

      await page.goto(toAppUrl(entry.path))
      await entry.waitFor(page)

      if (entry.setup) {
        await entry.setup(page)
      }

      await page.waitForLoadState('networkidle')

      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      })
      await expect(page).toHaveScreenshot([entry.section, `${entry.name}.png`], SCREENSHOT_OPTIONS)
    })
  }
})
