/**
 * E2E Tests: AAP Push Button OIDC Configuration
 *
 * Critical paths covered:
 * - Push-Button OIDC Gateway — Configuration Wizard
 * - Push-Button OIDC Gateway — Error Feedback
 */
import { test, expect, toAppUrl } from './fixtures'
import { AAP_OIDC_IDP } from './fixtures/mock-oidc-idps'

const IDP_URL = '/system-administration/authentication'

test.describe('AAP Push Button OIDC Configuration', () => {
  test('Push-Button OIDC Gateway — Configuration Wizard', async ({ app }) => {
    await app.goto(toAppUrl(IDP_URL))
    await expect(app.getByRole('heading', { level: 1, name: 'Identity Providers' })).toBeVisible()

    await app.getByRole('button', { name: /Add Ansible Automation Platform/i }).click()
    const aapDialog = app.getByRole('dialog')
    await expect(aapDialog.getByRole('heading', { level: 1, name: /Add Ansible Automation Platform/i })).toBeVisible()

    await expect(aapDialog.getByRole('textbox', { name: /Ansible Automation Platform URL/i })).toBeVisible()
    await expect(aapDialog.getByRole('textbox', { name: /Organization/i })).toBeVisible()

    await aapDialog.getByRole('textbox', { name: /Ansible Automation Platform URL/i }).fill('https://aap.example.com')
    await aapDialog.getByRole('textbox', { name: /Personal access token/i }).fill('mock-pat')

    await app.route('**/api/v1/identity_providers/setup_aap_oidc**', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(AAP_OIDC_IDP),
      })
    )

    await app.route('**/api/v1/identity_providers**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resources: [AAP_OIDC_IDP] }),
      })
    )

    await aapDialog.getByRole('button', { name: /Add provider/i }).click()
    await expect(
      app.getByRole('heading', { name: /Ansible Automation Platform identity provider created/i })
    ).toBeVisible()
    await expect(app.getByRole('row', { name: /AAP/i })).toBeVisible()
  })

  test('Push-Button OIDC Gateway — Error Feedback', async ({ app }) => {
    await app.goto(toAppUrl(IDP_URL))
    await expect(app.getByRole('heading', { level: 1, name: 'Identity Providers' })).toBeVisible()

    await app.getByRole('button', { name: /Add Ansible Automation Platform/i }).click()
    const aapDialog = app.getByRole('dialog')
    await expect(aapDialog.getByRole('heading', { level: 1, name: /Add Ansible Automation Platform/i })).toBeVisible()

    await expect(aapDialog.getByRole('textbox', { name: /Ansible Automation Platform URL/i })).toBeVisible()
    await expect(aapDialog.getByRole('textbox', { name: /Organization/i })).toBeVisible()

    await aapDialog.getByRole('textbox', { name: /Ansible Automation Platform URL/i }).fill('invalid-url')
    await aapDialog.getByRole('textbox', { name: /Personal access token/i }).fill('mock-pat')
    await aapDialog.getByRole('button', { name: /Add provider/i }).click()
    await expect(app.getByRole('textbox', { name: /Ansible Automation Platform URL/i })).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    await expect(app.getByText('Must be a valid URL')).toBeVisible()

    await app.route('**/api/v1/identity_providers/setup_aap_oidc**', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://api.example.com/errors/aap-connection-error',
          title: 'AAP Connection Error',
          detail: 'Unable to connect to AAP at https://unreachable.example.com: connection refused',
          code: 'AAP_CONNECTION_ERROR',
          retryable: true,
        }),
      })
    )

    await aapDialog
      .getByRole('textbox', { name: /Ansible Automation Platform URL/i })
      .fill('https://unreachable.example.com')
    await aapDialog.getByRole('button', { name: /Add provider/i }).click()
    // PF6 Modal sets aria-hidden on non-modal siblings, hiding the toast from the a11y tree
    await expect(
      app.getByRole('heading', { name: /Failed to add Ansible Automation Platform/i, includeHidden: true })
    ).toBeVisible()
  })
})
