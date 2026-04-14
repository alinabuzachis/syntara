import { expect, type Page } from '@playwright/test'

import { toAppUrl } from '../fixtures'

import { buildUniqueName } from './workflows'

/** Navigate to the credentials list page and wait for it to load */
export async function goToCredentialsList(app: Page) {
  await app.goto(toAppUrl('/configuration/credentials'))
  await expect(app.getByRole('heading', { name: 'Credentials', level: 1 })).toBeVisible()
}

/**
 * Create a credential via the UI and return its name.
 * Uses HTTP Bearer Token type (single required field) for simplicity.
 */
export async function createTestCredential(app: Page, options: { prefix?: string; enabled?: boolean } = {}) {
  const name = buildUniqueName(options.prefix ?? 'e2e-cred')
  await goToCredentialsList(app)
  await app.getByRole('button', { name: 'Create credential' }).click()

  const modal = app.getByRole('dialog')
  await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
  await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Bearer Token' })
  await modal.getByRole('textbox', { name: 'Token' }).fill('e2e-test-token')
  await modal.getByRole('button', { name: 'Create credential' }).click()
  await expect(app.getByText('Credential created')).toBeVisible()

  // If we need a disabled credential, disable it now
  if (options.enabled === false) {
    await goToCredentialsList(app)
    const row = app.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('switch', { name: 'Enabled' }).click()
    const dialog = app.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Disable' }).click()
    await expect(app.getByText('Credential disabled')).toBeVisible()
  }

  return name
}

/**
 * Delete a credential by name via the UI.
 * Navigates to credentials list, filters by name, opens kebab menu, and deletes.
 * Silently succeeds if the credential is not found (already deleted or never created).
 */
export async function deleteCredentialByName(app: Page, name: string) {
  await goToCredentialsList(app)

  // Filter to find the credential
  await app.getByPlaceholder('Filter by keyword').fill(name)
  await app.getByRole('button', { name: 'Apply filter' }).click()

  const row = app.getByRole('row', { name: new RegExp(name) })
  const rowExists = await row
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false)

  if (!rowExists) return

  // Open kebab menu and delete
  await row
    .getByRole('button', { name: /Actions|Kebab toggle/i })
    .first()
    .click()
  await app.getByRole('menuitem', { name: /Delete/i }).click()

  // Confirm deletion in the dialog
  const dialog = app.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(app.getByText('Credential deleted')).toBeVisible()
}

/**
 * Navigate to credentials list, filter by name, and click the credential row
 * to open its detail page.
 */
export async function navigateToCredentialDetail(app: Page, credentialName: string) {
  await goToCredentialsList(app)

  // Filter to find the credential (handles pagination / large datasets)
  await app.getByPlaceholder('Filter by keyword').fill(credentialName)
  await app.getByRole('button', { name: 'Apply filter' }).click()

  const table = app.getByRole('grid', { name: 'Credentials table' })
  await table.getByRole('row', { name: new RegExp(credentialName) }).click()
  await expect(app.getByText(credentialName).first()).toBeVisible()
}
