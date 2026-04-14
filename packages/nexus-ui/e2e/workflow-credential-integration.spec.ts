import type { Page } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'
import { deleteCredentialByName, goToCredentialsList } from './helpers/credentials'
import { addNodePanel, buildUniqueName } from './helpers/workflows'

/**
 * Navigate to the workflow builder and add an API action node form
 * where the credential selector is visible.
 *
 * Flow: New workflow → Manual trigger → Add connected node → Action → REST API
 */
async function navigateToApiActionForm(app: Page) {
  await app.goto(toAppUrl('/automation-builder/new'))
  await expect(app.getByRole('heading', { name: 'Select a trigger node' })).toBeVisible()

  // Add manual trigger
  await app.getByRole('button', { name: 'Manual trigger' }).click()
  await app.getByLabel('Name').fill('Manual trigger')
  await app.getByRole('button', { name: /^Add node$/ }).click()

  // Add connected API action node
  await expect(app.getByRole('button', { name: 'Add connected node' })).toBeVisible()
  await app.getByRole('button', { name: 'Add connected node' }).click({ force: true })
  const panel = addNodePanel(app)
  await expect(panel).toHaveCount(1)
  await panel.getByRole('button', { name: 'Action', exact: true }).click()
  await panel.getByRole('button', { name: 'REST API', exact: true }).click()

  // Wait for the form to load
  await expect(app.getByLabel('Name')).toBeVisible()
}

test.describe('Credential Selector', () => {
  test('credential selector appears in API action node form', async ({ app }) => {
    // Arrange & Act
    await navigateToApiActionForm(app)

    // Assert - Credential selector is visible
    await expect(app.getByRole('button', { name: 'Credential' })).toBeVisible()
  })

  test('credential selector shows available credentials', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)

    // Act - Open the credential selector dropdown
    await app.getByRole('button', { name: 'Credential' }).click()

    // Assert - Credentials from seed data are visible as options
    await expect(app.getByRole('option', { name: /Production API Auth/ })).toBeVisible()
    await expect(app.getByRole('option', { name: /GitHub API Token/ })).toBeVisible()
  })

  test('select existing credential from selector', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)

    // Act - Open dropdown and select a credential
    await app.getByRole('button', { name: 'Credential' }).click()
    await app.getByRole('option', { name: /Production API Auth/ }).click()

    // Assert - Toggle now shows the selected credential name
    await expect(app.getByRole('button', { name: 'Credential' })).toContainText('Production API Auth')
  })

  test('create new credential option appears in selector', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)

    // Act - Open the credential selector dropdown
    await app.getByRole('button', { name: 'Credential' }).click()

    // Assert - "Create new credential" option is visible
    await expect(app.getByRole('option', { name: /Create new credential/ })).toBeVisible()
  })

  test('credential selector filters by compatible type', async ({ app }) => {
    // Arrange - Create an incompatible credential (LLM type) that should NOT appear
    const incompatibleName = buildUniqueName('e2e-llm-incompat')
    await goToCredentialsList(app)
    await app.getByRole('button', { name: 'Create credential' }).click()
    const createModal = app.getByRole('dialog')
    await createModal.getByRole('textbox', { name: 'Credential name' }).fill(incompatibleName)
    await createModal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'LLM Provider' })
    await createModal.getByRole('textbox', { name: 'API Key' }).fill('test-llm-key')
    await createModal.getByRole('button', { name: 'Create credential' }).click()
    await expect(app.getByText('Credential created')).toBeVisible()

    try {
      // Act - Navigate to API action form (only shows HTTP Bearer Token and HTTP Basic Auth)
      await navigateToApiActionForm(app)
      await app.getByRole('button', { name: 'Credential' }).click()

      // Assert - Incompatible LLM credential is NOT in the list
      await expect(app.getByRole('option', { name: new RegExp(incompatibleName) })).not.toBeVisible()
    } finally {
      await deleteCredentialByName(app, incompatibleName)
    }
  })

  test('clear credential selection', async ({ app }) => {
    // Arrange - Select a credential first
    await navigateToApiActionForm(app)
    await app.getByRole('button', { name: 'Credential' }).click()
    await app.getByRole('option', { name: /Production API Auth/ }).click()
    await expect(app.getByRole('button', { name: 'Credential' })).toContainText('Production API Auth')

    // Act - Open dropdown and click "No credential" to clear
    await app.getByRole('button', { name: 'Credential' }).click()
    await app.getByRole('option', { name: /No credential/ }).click()

    // Assert - Toggle returns to default text
    await expect(app.getByRole('button', { name: 'Credential' })).toContainText('No credential')
  })
})

test.describe('Inline Credential Creation', () => {
  test('open inline credential creation modal', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)

    // Act - Open dropdown and click "Create new credential"
    await app.getByRole('button', { name: 'Credential' }).click()
    await app.getByRole('option', { name: /Create new credential/ }).click()

    // Assert - Modal opens
    const modal = app.getByRole('dialog')
    await expect(modal).toBeVisible()
    await expect(modal.getByText('Create credential')).toBeVisible()
  })

  test('inline modal has pre-selected credential type', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)
    await app.getByRole('button', { name: 'Credential' }).click()
    await app.getByRole('option', { name: /Create new credential/ }).click()

    // Assert - Credential type is pre-selected and disabled
    const modal = app.getByRole('dialog')
    await expect(modal.getByRole('combobox', { name: 'Credential type' })).toBeDisabled()
  })

  test('create credential inline and auto-select', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)
    await app.getByRole('button', { name: 'Credential' }).click()
    await app.getByRole('option', { name: /Create new credential/ }).click()

    // Act - Fill and submit the inline creation form
    const modal = app.getByRole('dialog')
    const credName = buildUniqueName('e2e-inline-cred')
    await modal.getByRole('textbox', { name: 'Credential name' }).fill(credName)
    // The pre-selected type is HTTP Bearer Token (first compatible type for API action)
    await expect(modal.getByRole('textbox', { name: 'Token' })).toBeVisible()
    await modal.getByRole('textbox', { name: 'Token' }).fill('inline-test-token')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    try {
      // Assert - Success and auto-selected
      await expect(app.getByText('Credential created')).toBeVisible()
      await expect(app.getByRole('button', { name: 'Credential' })).toContainText(credName)
    } finally {
      await deleteCredentialByName(app, credName)
    }
  })

  test('cancel inline creation closes modal', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)
    await app.getByRole('button', { name: 'Credential' }).click()
    await app.getByRole('option', { name: /Create new credential/ }).click()

    // Act - Click Cancel
    const modal = app.getByRole('dialog')
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Cancel' }).click()

    // Assert - Modal closed, no credential selected
    await expect(modal).not.toBeVisible()
    await expect(app.getByRole('button', { name: 'Credential' })).toContainText('No credential')
  })

  test('inline creation validates required fields', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)
    await app.getByRole('button', { name: 'Credential' }).click()
    await app.getByRole('option', { name: /Create new credential/ }).click()

    // Act - Submit without filling required fields
    const modal = app.getByRole('dialog')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    // Assert - Validation errors shown
    // Scope to the Name field's FormGroup to avoid matching "Username is required"
    await expect(
      modal
        .getByRole('textbox', { name: 'Credential name' })
        .locator('xpath=ancestor::div[contains(@class,"form__group")]')
        .getByText('Name is required')
    ).toBeVisible()
  })

  test('newly created credential is available in selector', async ({ app }) => {
    // Arrange - Create a credential via inline modal
    await navigateToApiActionForm(app)
    await app.getByRole('button', { name: 'Credential' }).click()
    await app.getByRole('option', { name: /Create new credential/ }).click()

    const modal = app.getByRole('dialog')
    const credName = buildUniqueName('e2e-available-cred')
    await modal.getByRole('textbox', { name: 'Credential name' }).fill(credName)
    await modal.getByRole('textbox', { name: 'Token' }).fill('availability-test-token')
    await modal.getByRole('button', { name: 'Create credential' }).click()
    await expect(app.getByText('Credential created')).toBeVisible()

    try {
      // Act - Open the selector dropdown again
      await app.getByRole('button', { name: 'Credential' }).click()

      // Assert - Newly created credential appears in the list
      await expect(app.getByRole('option', { name: new RegExp(credName) })).toBeVisible()
    } finally {
      await deleteCredentialByName(app, credName)
    }
  })
})
