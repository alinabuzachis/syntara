/**
 * E2E Tests: Email Collision — Sign-in Error Display (UI-35)
 *
 * Critical paths covered:
 * - OIDC callback returns auth_error=email_already_linked → error alert displayed
 * - Error message informs user about existing account and suggests identity linking
 * - OIDC provider buttons remain accessible despite error
 * - auth_error query param is cleaned from URL after display
 *
 * These tests simulate the OIDC callback redirect by navigating to the login
 * page with a ?auth_error query parameter. The AppLoginForm component reads
 * this param on mount and displays the resolved error message.
 */
import AxeBuilder from '@axe-core/playwright'

import { test, expect } from './fixtures'
import { AAP_AUTH_PROVIDER, KEYCLOAK_AUTH_PROVIDER } from './fixtures/mock-oidc-idps'
import { goToLoginPage } from './helpers/login'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

const PROVIDERS = [KEYCLOAK_AUTH_PROVIDER, AAP_AUTH_PROVIDER]

test.describe('Email collision — sign-in error display (UI-35)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('displays authentication error when OIDC sign-in encounters email collision', async ({ page }) => {
    await goToLoginPage(page, { providers: PROVIDERS, authError: 'email_already_linked' })

    await expect(page.getByRole('heading', { name: 'Authentication failed' })).toBeVisible()

    await expect(page.getByText(/email is already associated with an existing account/i)).toBeVisible()

    await expect(page.getByText(/link this identity provider via the Identities tab/i)).toBeVisible()
  })

  test('OIDC provider buttons remain accessible despite email collision error', async ({ page }) => {
    await goToLoginPage(page, { providers: PROVIDERS, authError: 'email_already_linked' })

    await expect(page.getByText(/email is already associated/i)).toBeVisible()

    await expect(page.getByRole('button', { name: 'Log in with Keycloak' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log in with AAP' })).toBeVisible()
  })

  test('auth_error query parameter is cleaned from URL after display', async ({ page }) => {
    await goToLoginPage(page, { providers: PROVIDERS, authError: 'email_already_linked' })

    await expect(page.getByText(/email is already associated/i)).toBeVisible()

    await expect(page).not.toHaveURL(/auth_error/)
  })

  test('login page with email collision error has no accessibility violations', async ({ page }) => {
    await goToLoginPage(page, { providers: PROVIDERS, authError: 'email_already_linked' })

    await expect(page.getByText(/email is already associated/i)).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
    expect(results.violations).toEqual([])
  })
})
