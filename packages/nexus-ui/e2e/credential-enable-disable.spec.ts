import { test, expect, toAppUrl } from './fixtures'
import {
  createTestCredential,
  deleteCredentialByName,
  goToCredentialsList,
  navigateToCredentialDetail,
} from './helpers/credentials'

async function filterCredentialByName(app: import('@playwright/test').Page, name: string) {
  await app.getByPlaceholder('Filter by keyword').fill(name)
  await app.getByRole('button', { name: 'Apply filter' }).click()
}

test.describe('Credential Enable/Disable State Management', () => {
  // Tests create and mutate credentials — run serially to avoid shared state conflicts
  test.describe.configure({ mode: 'serial' })

  test('toggle on enabled credential opens disable confirmation', async ({ app }) => {
    const name = await createTestCredential(app, { prefix: 'e2e-toggle-open' })
    try {
      await goToCredentialsList(app)
      await filterCredentialByName(app, name)
      const row = app.getByRole('row', { name: new RegExp(name) })
      await row.getByRole('switch').click()

      const dialog = app.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Disable credential?')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('disable confirmation dialog shows warning with credential name', async ({ app }) => {
    const name = await createTestCredential(app, { prefix: 'e2e-toggle-warn' })
    try {
      await goToCredentialsList(app)
      await filterCredentialByName(app, name)
      const row = app.getByRole('row', { name: new RegExp(name) })
      await row.getByRole('switch').click()

      const dialog = app.getByRole('dialog')
      await expect(dialog.getByText(new RegExp(name))).toBeVisible()
      await expect(dialog.getByText(/may cause these workflows to fail/)).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Disable' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('confirm disable changes credential state', async ({ app }) => {
    const name = await createTestCredential(app, { prefix: 'e2e-toggle-confirm' })
    try {
      await goToCredentialsList(app)
      await filterCredentialByName(app, name)
      const row = app.getByRole('row', { name: new RegExp(name) })
      await row.getByRole('switch').click()

      const dialog = app.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Disable' }).click()

      await expect(app.getByText('Credential disabled')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('cancel disable keeps credential enabled', async ({ app }) => {
    const name = await createTestCredential(app, { prefix: 'e2e-toggle-cancel' })
    try {
      await goToCredentialsList(app)
      await filterCredentialByName(app, name)
      const row = app.getByRole('row', { name: new RegExp(name) })
      await row.getByRole('switch').click()

      const dialog = app.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancel' }).click()

      await expect(dialog).not.toBeVisible()
      const toggle = row.getByRole('switch')
      await expect(toggle).toBeChecked()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('re-enable credential without confirmation', async ({ app }) => {
    const name = await createTestCredential(app, { prefix: 'e2e-toggle-reenable', enabled: false })
    try {
      await goToCredentialsList(app)
      await filterCredentialByName(app, name)
      const row = app.getByRole('row', { name: new RegExp(name) })

      const toggle = row.getByRole('switch')
      await expect(toggle).not.toBeChecked()

      await row.getByRole('switch').click()

      await expect(app.getByText('Credential enabled')).toBeVisible()
      await expect(toggle).toBeChecked()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('disable from detail page', async ({ app }) => {
    const name = await createTestCredential(app, { prefix: 'e2e-toggle-detail' })
    try {
      await navigateToCredentialDetail(app, name)

      await app.getByRole('switch', { name: /enabled/i }).click()

      const dialog = app.getByRole('dialog')
      await expect(dialog.getByText('Disable credential?')).toBeVisible()
      await dialog.getByRole('button', { name: 'Disable' }).click()

      await expect(app.getByText('Credential disabled')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('state badge reflects current state on detail page', async ({ app }) => {
    const name = await createTestCredential(app, { prefix: 'e2e-toggle-badge' })
    try {
      await navigateToCredentialDetail(app, name)

      const detailsTab = app.getByLabel('Details')
      await expect(detailsTab.getByText('Enabled')).toBeVisible()

      await app.getByRole('switch', { name: /enabled/i }).click()
      const dialog = app.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Disable' }).click()
      await expect(app.getByText('Credential disabled')).toBeVisible()

      await expect(detailsTab.getByText('Disabled')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('state persists across page navigation', async ({ app }) => {
    const name = await createTestCredential(app, { prefix: 'e2e-toggle-persist' })
    try {
      // Disable the credential
      await goToCredentialsList(app)
      await filterCredentialByName(app, name)
      const row = app.getByRole('row', { name: new RegExp(name) })
      await row.getByRole('switch').click()
      const dialog = app.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Disable' }).click()
      await expect(app.getByText('Credential disabled')).toBeVisible()

      // Navigate away and back
      await app.goto(toAppUrl('/workflows'))
      await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await goToCredentialsList(app)

      // Filter to find our credential
      await filterCredentialByName(app, name)

      const updatedRow = app.getByRole('row', { name: new RegExp(name) })
      const updatedToggle = updatedRow.getByRole('switch')
      await expect(updatedToggle).not.toBeChecked()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })
})
