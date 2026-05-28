/**
 * E2E Tests: Login Form Error Handling
 *
 * Critical paths covered:
 * - Empty field validation (username, password)
 * - Wrong credentials → inline error + password cleared
 * - Error clears when user types
 * - Successful login after correcting credentials
 *
 * These tests use raw `page` (not the `app` fixture) because `app`
 * auto-logs-in via the mock API. We intercept `/auth/refresh` to block
 * the bootstrap and `/auth/login` to simulate failures.
 */
import AxeBuilder from '@axe-core/playwright'

import { test, expect, appBaseUrl } from './fixtures'
import { BUILT_IN_ADMIN_USER_INFO } from './fixtures/mock-users'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

/**
 * Navigate to the login page in a clean state by blocking the
 * bootstrap refresh (which would auto-authenticate via cookie).
 */
async function goToLoginPage(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/auth/csrf-token', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ csrf_token: 'mock-csrf-e2e' }),
    })
  )

  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'https://api.nexus.com/errors/unauthorized',
        title: 'Unauthorized',
        detail: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      }),
    })
  )

  await page.route('**/api/v1/auth/providers', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], count: 0 }),
    })
  )

  await page.goto(appBaseUrl)
  await expect(page.getByRole('heading', { name: 'Log in to Automation Orchestrator' })).toBeVisible()
}

test.describe('Login form error handling', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows error when submitting with empty username', async ({ page }) => {
    await goToLoginPage(page)

    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page.getByText('Enter your username')).toBeVisible()
  })

  test('shows error when submitting with empty password', async ({ page }) => {
    await goToLoginPage(page)

    await page.getByLabel('Username').fill('demo')
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page.getByText('Enter your password')).toBeVisible()
  })

  test('shows error and clears password on wrong credentials', async ({ page }) => {
    await goToLoginPage(page)

    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://api.nexus.com/errors/unauthorized',
          title: 'Unauthorized',
          detail: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        }),
      })
    )

    await page.getByLabel('Username').fill('demo')
    await page.getByRole('textbox', { name: 'Password' }).fill('wrongpassword')
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page.getByText('Incorrect login credentials')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Password' })).toHaveValue('')
  })

  test('clears error when user types in a field', async ({ page }) => {
    await goToLoginPage(page)

    // Trigger empty username error
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Enter your username')).toBeVisible()

    // Type in username — error should clear
    await page.getByLabel('Username').fill('d')
    await expect(page.getByText('Enter your username')).not.toBeVisible()
  })

  test('can log in after correcting wrong credentials', async ({ page }) => {
    await goToLoginPage(page)

    let loginAttempts = 0
    await page.route('**/api/v1/auth/login', (route) => {
      loginAttempts++
      if (loginAttempts === 1) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'https://api.nexus.com/errors/unauthorized',
            title: 'Unauthorized',
            detail: 'Authentication required',
            code: 'AUTHENTICATION_REQUIRED',
          }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token-demo',
          token_type: 'bearer',
          expires_in: 3600,
        }),
      })
    })

    // First attempt — wrong password
    await page.getByLabel('Username').fill('demo')
    await page.getByRole('textbox', { name: 'Password' }).fill('wrong')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Incorrect login credentials')).toBeVisible()

    // Second attempt — correct password → should navigate to app
    await page.getByLabel('Username').fill('demo')
    await page.getByRole('textbox', { name: 'Password' }).fill('coffee')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  })

  test('login page has no accessibility violations', async ({ page }) => {
    await goToLoginPage(page)

    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
    expect(results.violations).toEqual([])
  })

  test('login page in error state has no accessibility violations', async ({ page }) => {
    await goToLoginPage(page)

    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Enter your username')).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('Login form validation', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Shows only username and password fields when no external IdP is configured', async ({ page }) => {
    await goToLoginPage(page)

    await expect(page.getByLabel('Username')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()

    await expect(page.getByRole('button', { name: /^Log in with /i })).toHaveCount(0)
  })
})

test.describe('Built-in admin login flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Built-in admin can log in and has full application access', async ({ page }) => {
    await goToLoginPage(page)

    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token-admin',
          token_type: 'bearer',
          expires_in: 3600,
        }),
      })
    )

    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(BUILT_IN_ADMIN_USER_INFO),
      })
    )

    // goToLoginPage blocks /auth/refresh with 401 for bootstrap; allow refresh after login.
    await page.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token-admin',
          token_type: 'bearer',
          expires_in: 3600,
        }),
      })
    )

    // Settings nav filtering uses POST /authz/can_i (underscore) per AAP-75846 — not legacy can-i.
    const canIResponse = {
      allowed: true,
      denied: false,
      matched_policy: '',
      denial_reason: '',
      denied_by: '',
    }
    await page.route('**/api/v1/authz/can_i', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(canIResponse),
      })
    )

    await page.getByLabel('Username').fill('admin')
    await page.getByRole('textbox', { name: 'Password' }).fill('coffee')

    const settingsPermissionChecks = Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/v1/authz/can_i') && resp.request().method() === 'POST' && resp.ok()
      ),
      page.waitForResponse(
        (resp) => resp.url().includes('/api/v1/authz/can_i') && resp.request().method() === 'POST' && resp.ok()
      ),
    ])

    await page.getByRole('button', { name: 'Log in' }).click()

    const mainNav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(mainNav).toBeVisible({ timeout: 30_000 })
    await settingsPermissionChecks

    // Compass dock nav can overflow vertically; last items may need scroll into view.
    const systemAdminNav = mainNav.getByRole('button', { name: 'System Administration' })
    await systemAdminNav.scrollIntoViewIfNeeded()
    await expect(systemAdminNav).toBeVisible()
  })
})
