/**
 * E2E Tests: Session Revocation (UI-29)
 *
 * Critical paths covered:
 * - UI-29: IdP-scoped session revocation via identity provider delete confirmation
 *
 * Reference: ANSTRAT-1844, AAP-71181
 */
import { type Page } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'
import { MINIMAL_OIDC_PROVIDER_CONFIGURATION } from './helpers/identity-providers'
import { buildUniqueName } from './helpers/workflows'
import { createIdentityProviderViaApi, deleteIdentityProviderViaApi } from './utils/api'

const AUTHENTICATION_URL = '/system-administration/authentication'

const IDP_DELETE_ACK_LABEL =
  /I understand this identity provider and its linked identities will be permanently deleted/i

async function openDeleteDialogFromList(app: Page, providerName: string) {
  await app.goto(toAppUrl(AUTHENTICATION_URL))
  await expect(app.getByRole('heading', { level: 1, name: 'Identity Providers' })).toBeVisible()

  const table = app.getByRole('grid', { name: 'Identity providers table' })
  await expect(table).toBeVisible()

  const providerRow = table.getByRole('row', { name: new RegExp(providerName) })
  await expect(providerRow).toBeVisible()

  await providerRow
    .getByRole('button', { name: /Actions|Kebab toggle/i })
    .first()
    .click({ force: true })
  await app.getByRole('menuitem', { name: 'Delete' }).click()
}

async function confirmIdpDeleteDialog(app: Page, providerName: string) {
  const dialog = app.getByRole('dialog', { name: 'Delete identity provider?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(new RegExp(providerName))).toBeVisible()
  await expect(dialog.getByText(/Revoke active sessions authenticated via this provider/i)).toBeVisible()
  await expect(dialog.getByText(/Remove all user identities linked to this provider/i)).toBeVisible()

  const deleteButton = dialog.getByRole('button', { name: 'Delete' })
  await expect(deleteButton).toBeDisabled()

  const checkbox = dialog.getByRole('checkbox')
  await expect(checkbox).toBeVisible()
  await expect(dialog.getByText(IDP_DELETE_ACK_LABEL)).toBeVisible()
  await checkbox.click()
  await expect(deleteButton).toBeEnabled()
  await deleteButton.click()
}

test.describe('Session Revocation — IdP-Scoped (UI-29)', () => {
  test('delete identity provider from list confirms session revocation scope and succeeds', async ({ app }) => {
    const providerName = buildUniqueName('e2e-idp-revoke-sessions')
    let providerId: string | null = null

    try {
      const provider = await createIdentityProviderViaApi(app, {
        name: providerName,
        configuration: MINIMAL_OIDC_PROVIDER_CONFIGURATION,
      })
      providerId = provider?.id ?? null
      expect(providerId).toBeTruthy()

      await openDeleteDialogFromList(app, providerName)
      await confirmIdpDeleteDialog(app, providerName)

      await expect(app.getByText('Identity provider deleted')).toBeVisible({ timeout: 10_000 })

      const table = app.getByRole('grid', { name: 'Identity providers table' })
      await expect(table.getByRole('row', { name: new RegExp(providerName) })).toHaveCount(0)

      providerId = null
    } finally {
      if (providerId) {
        await deleteIdentityProviderViaApi(app, providerId)
      }
    }
  })

  test('delete identity provider from detail page confirms session revocation scope and succeeds', async ({ app }) => {
    const providerName = buildUniqueName('e2e-idp-revoke-detail')
    let providerId: string | null = null

    try {
      const provider = await createIdentityProviderViaApi(app, {
        name: providerName,
        configuration: MINIMAL_OIDC_PROVIDER_CONFIGURATION,
      })
      providerId = provider?.id ?? null
      expect(providerId).toBeTruthy()

      await app.goto(toAppUrl(`${AUTHENTICATION_URL}/identity-providers/${providerId}`))
      await expect(app.getByRole('heading', { level: 1, name: providerName })).toBeVisible()

      await app
        .getByRole('button', { name: /Kebab toggle/i })
        .first()
        .click({ force: true })
      await app.getByRole('menuitem', { name: 'Delete' }).click()

      await confirmIdpDeleteDialog(app, providerName)

      await expect(app.getByText('Identity provider deleted')).toBeVisible({ timeout: 10_000 })
      await expect(app).toHaveURL(new RegExp(`${AUTHENTICATION_URL.replace(/\//g, '\\/')}$`))

      providerId = null
    } finally {
      if (providerId) {
        await deleteIdentityProviderViaApi(app, providerId)
      }
    }
  })
})
