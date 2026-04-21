import { type Page } from '@playwright/test'

import { expect, toAppUrl } from '../fixtures'

import { buildUniqueName } from './workflows'

/** Navigate to the credentials list page and wait for it to load */
export async function goToCredentialsList(app: Page, options?: { ensureCreateEnabled?: boolean }) {
  await app.goto(toAppUrl('/configuration/credentials'))
  await expect(app.getByText('Credentials', { exact: true }).first()).toBeVisible()

  if (!options?.ensureCreateEnabled) return

  // Select a project if needed (Create credential is disabled without one on real backend)
  const projectToggle = app.getByRole('button', { name: /All projects|Select a project/i }).first()
  // waitFor with catch: toggle may not exist (e.g. mock API) — treat as "no toggle"
  const hasToggle = await projectToggle
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false)
  if (hasToggle) {
    const createBtn = app.getByRole('button', { name: 'Create credential' }).first()
    const disabled = await createBtn.isDisabled()
    if (disabled) {
      await projectToggle.click()
      await app.getByRole('option', { name: 'default' }).click()
      await expect(createBtn).toBeEnabled({ timeout: 5000 })
    }
  }
}

/**
 * Create a credential via the UI and return its name.
 * Uses HTTP Bearer Token type (single required field) for simplicity.
 */
export async function createTestCredential(app: Page, options: { prefix?: string; enabled?: boolean } = {}) {
  const name = buildUniqueName(options.prefix ?? 'e2e-cred')
  await goToCredentialsList(app, { ensureCreateEnabled: true })
  // Use .first() because on an empty list the button appears in both the toolbar and the empty state
  await app.getByRole('button', { name: 'Create credential' }).first().click()

  const modal = app.getByRole('dialog')
  await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
  await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Bearer Token' })
  await modal.getByRole('textbox', { name: 'Token' }).fill('e2e-test-token')
  await modal.getByRole('button', { name: 'Create credential' }).click()
  await expect(app.getByText('Credential created')).toBeVisible()

  // If we need a disabled credential, disable it now
  if (options.enabled === false) {
    await goToCredentialsList(app)
    await app.getByPlaceholder('Filter by keyword').fill(name)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const row = app.getByRole('row', { name: new RegExp(name) })
    await row.getByRole('switch', { name: 'Enabled' }).click()
    const dialog = app.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Disable' }).click()
    await expect(app.getByText('Credential disabled')).toBeVisible()
  }

  return name
}

/**
 * Delete a credential by name via the API.
 * Uses page.request to call the API directly — faster and more reliable than
 * UI-based cleanup, especially in finally blocks where timeouts are tight.
 */
export async function deleteCredentialByName(app: Page, name: string) {
  if (app.isClosed()) return
  const apiBase = process.env.NEXUS_E2E_BASE_URL ?? 'http://localhost:4173'

  try {
    const listResp = await app.request.get(`${apiBase}/api/v1/credentials?name=${encodeURIComponent(name)}`)
    if (!listResp.ok()) return

    const body = (await listResp.json()) as { results?: { id: string }[]; data?: { id: string }[] }
    const credentials = body.results ?? body.data ?? []
    for (const cred of credentials) {
      if (cred.id) {
        await app.request.delete(`${apiBase}/api/v1/credentials/${cred.id}`)
      }
    }
  } catch {
    // Best-effort cleanup — don't fail the test if cleanup fails
  }
}

/**
 * Navigate to credentials list, filter by name, and click the credential name
 * link to open its detail page.
 */
export async function navigateToCredentialDetail(app: Page, credentialName: string) {
  await goToCredentialsList(app)

  // Filter to find the credential (handles pagination / large datasets)
  await app.getByPlaceholder('Filter by keyword').fill(credentialName)
  await app.getByRole('button', { name: 'Apply filter' }).click()

  // Click the credential name link (LinkCell renders a Button variant="link")
  // Clicking the row itself does not trigger navigation
  const table = app.getByRole('grid', { name: 'Credentials table' })
  await table.getByRole('button', { name: credentialName }).click()
  await expect(app).toHaveURL(/configuration\/credentials\//)
}
