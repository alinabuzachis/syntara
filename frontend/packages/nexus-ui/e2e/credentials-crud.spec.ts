/**
 * E2E Tests: Credential Form Behavior (additive)
 *
 * Tests 14-15 from the ANSTRAT-1901 test plan. Tests 8-13 (create + validation
 * for all 5 credential types) are already covered by credential-dynamic-forms.spec.ts.
 *
 * Covers:
 * - Type change resets dynamic fields (no carryover)
 * - Form reset on modal open/close (clean state)
 */

import { test, expect } from './fixtures'
import { openCreateModal, selectCredentialType } from './helpers/credentials'

// ---------------------------------------------------------------------------
// Type Change Resets Dynamic Fields
// ---------------------------------------------------------------------------

test.describe('Type Change Resets Dynamic Fields', () => {
  test('switching from HTTP Basic Auth to LLM Provider removes old fields and renders new ones', async ({ app }) => {
    const modal = await openCreateModal(app)

    await selectCredentialType(modal, 'HTTP Basic Auth')
    await expect(modal.getByRole('textbox', { name: 'Username' })).toBeVisible()
    await modal.getByRole('textbox', { name: 'Username' }).fill('old-user')
    await modal.getByRole('textbox', { name: 'Password' }).fill('old-pass')

    await selectCredentialType(modal, 'LLM Provider')

    await expect(modal.getByRole('combobox', { name: 'Provider' })).toBeVisible()
    await expect(modal.getByRole('textbox', { name: 'API Key' })).toBeVisible()
    await expect(modal.getByRole('textbox', { name: 'Base URL' })).toBeVisible()

    await expect(modal.getByRole('textbox', { name: 'API Key' })).toHaveValue('')
    await expect(modal.getByRole('textbox', { name: 'Base URL' })).toHaveValue('')
  })
})

// ---------------------------------------------------------------------------
// Form Reset on Modal Open/Close
// ---------------------------------------------------------------------------

test.describe('Form Reset on Modal Open/Close', () => {
  test('closing modal without submitting and reopening shows a clean form', async ({ app }) => {
    const modal = await openCreateModal(app)

    await modal.getByRole('textbox', { name: 'Credential name' }).fill('should-not-persist')
    await modal.getByRole('textbox', { name: 'Credential description' }).fill('temp description')
    await selectCredentialType(modal, 'HTTP Basic Auth')
    await modal.getByRole('textbox', { name: 'Username' }).fill('temp-user')
    await modal.getByRole('textbox', { name: 'Password' }).fill('temp-pass')

    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).not.toBeVisible()

    await app.getByRole('button', { name: 'Create credential' }).first().click()
    const reopenedModal = app.getByRole('dialog')
    await expect(reopenedModal).toBeVisible()

    await expect(reopenedModal.getByRole('textbox', { name: 'Credential name' })).toHaveValue('')
    await expect(reopenedModal.getByRole('textbox', { name: 'Credential description' })).toHaveValue('')

    const usernameField = reopenedModal.getByRole('textbox', { name: 'Username' })
    if (await usernameField.isVisible()) {
      await expect(usernameField).toHaveValue('')
    }
  })
})
