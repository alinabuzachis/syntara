import type { Page } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'
import { deleteCredentialByName, goToCredentialsList } from './helpers/credentials'
import { buildUniqueName, clickAddConnectedStep } from './helpers/workflows'

/**
 * Navigate to the workflow builder and add an API action node form
 * where the credential selector is visible.
 *
 * Flow: New workflow → Manual trigger → Add connected step → Action → REST API
 */
async function navigateToApiActionForm(app: Page) {
  await app.goto(toAppUrl('/automation-builder/new'))
  await expect(app.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

  // Add manual trigger
  await app.getByRole('button', { name: 'Manual trigger' }).click()
  await app.getByLabel('Name').fill('Manual trigger')
  await app.getByRole('button', { name: /^Add step$/ }).click()

  // Add connected API action node — set up credential response listener
  // BEFORE clicking REST API (which triggers the credential fetch)
  const credentialsLoaded = app.waitForResponse(
    (resp) => resp.url().includes('/credentials') && resp.status() === 200
  )
  const panel = await clickAddConnectedStep(app)
  await panel.getByRole('button', { name: 'Action', exact: true }).click()
  await panel.getByRole('button', { name: 'REST API', exact: true }).click()

  // Wait for the form and credential data to fully load
  await expect(app.getByLabel('Name')).toBeVisible()
  await credentialsLoaded
  const credToggle = app.getByRole('button', { name: 'Authentication credential', exact: true })
  await expect(credToggle).toBeEnabled({ timeout: 5000 })
}

test.describe('Credential Selector', () => {
  test('credential selector appears in API action node form', async ({ app }) => {
    // Arrange & Act
    await navigateToApiActionForm(app)

    // Assert - Credential selector is visible
    await expect(app.getByRole('button', { name: 'Authentication credential', exact: true })).toBeVisible()
  })

  test('credential selector shows available credentials', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)

    // Act - Open the credential selector dropdown
    await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()

    // Assert - "Create new credential" option should always appear (allowCreate is true)
    await expect(app.getByRole('option', { name: /Create new credential/ })).toBeVisible()
  })

  test('select existing credential from selector', async ({ app }) => {
    // Arrange - Create a credential to select
    const credName = buildUniqueName('e2e-select-cred')

    try {
      await goToCredentialsList(app)
      await app.getByRole('button', { name: 'Create credential' }).first().click()
      const createModal = app.getByRole('dialog')
      await createModal.getByRole('textbox', { name: 'Credential name' }).fill(credName)
      await createModal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Bearer Token' })
      await createModal.getByRole('textbox', { name: 'Token' }).fill('select-test-token')
      await createModal.getByRole('button', { name: 'Create credential' }).click()
      await expect(app.getByText('Credential created')).toBeVisible()

      // Act - Navigate to API action form, open dropdown and select the credential
      await navigateToApiActionForm(app)
      await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()
      await app.getByRole('option', { name: credName, exact: true }).click()

      // Assert - Toggle now shows the selected credential name
      await expect(app.getByRole('button', { name: 'Authentication credential', exact: true })).toContainText(credName)
    } finally {
      await deleteCredentialByName(app, credName)
    }
  })

  test('create new credential option appears in selector', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)

    // Act - Open the credential selector dropdown
    await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()

    // Assert - "Create new credential" option is visible
    await expect(app.getByRole('option', { name: /Create new credential/ })).toBeVisible()
  })

  test('credential selector filters by compatible type', async ({ app }) => {
    // Arrange - Create an incompatible credential (LLM type) that should NOT appear
    const incompatibleName = buildUniqueName('e2e-llm-incompat')

    try {
      await goToCredentialsList(app)
      await app.getByRole('button', { name: 'Create credential' }).click()
      const createModal = app.getByRole('dialog')
      await createModal.getByRole('textbox', { name: 'Credential name' }).fill(incompatibleName)
      await createModal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'LLM Provider' })
      await createModal.getByRole('textbox', { name: 'API Key' }).fill('test-llm-key')
      await createModal.getByRole('button', { name: 'Create credential' }).click()
      await expect(app.getByText('Credential created')).toBeVisible()

      // Act - Navigate to API action form (only shows HTTP Bearer Token and HTTP Basic Auth)
      await navigateToApiActionForm(app)
      await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()

      // Assert - Incompatible LLM credential is NOT in the list
      await expect(app.getByRole('option', { name: incompatibleName, exact: true })).not.toBeVisible()
    } finally {
      await deleteCredentialByName(app, incompatibleName)
    }
  })

  // Skip: CredentialSelector has no "No credential" option to clear selection
  test.skip('clear credential selection', async ({ app }) => {
    // Arrange - Create a credential and select it
    const credName = buildUniqueName('e2e-clear-cred')

    try {
      await goToCredentialsList(app)
      await app.getByRole('button', { name: 'Create credential' }).first().click()
      const createModal = app.getByRole('dialog')
      await createModal.getByRole('textbox', { name: 'Credential name' }).fill(credName)
      await createModal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Bearer Token' })
      await createModal.getByRole('textbox', { name: 'Token' }).fill('clear-test-token')
      await createModal.getByRole('button', { name: 'Create credential' }).click()
      await expect(app.getByText('Credential created')).toBeVisible()

      await navigateToApiActionForm(app)
      await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()
      await app.getByRole('option', { name: credName, exact: true }).click()
      await expect(app.getByRole('button', { name: 'Authentication credential', exact: true })).toContainText(credName)

      // Act - Open dropdown and click "No credential" to clear
      await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()
      await app.getByRole('option', { name: /No credential/ }).click()

      // Assert - Toggle returns to default text
      await expect(app.getByRole('button', { name: 'Authentication credential', exact: true })).toContainText(
        'No credential'
      )
    } finally {
      await deleteCredentialByName(app, credName)
    }
  })
})

test.describe('Inline Credential Creation', () => {
  test('open inline credential creation modal', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)

    // Act - Open dropdown and click "Create new credential"
    await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()
    await app.getByRole('option', { name: /Create new credential/ }).click()

    // Assert - Modal opens with title
    const modal = app.getByRole('dialog')
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Create credential' })).toBeVisible()
  })

  test('inline modal has pre-selected credential type', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)
    await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()
    await app.getByRole('option', { name: /Create new credential/ }).click()

    // Assert - Credential type is pre-selected and disabled
    const modal = app.getByRole('dialog')
    await expect(modal.getByRole('combobox', { name: 'Credential type' })).toBeDisabled()
  })

  test('create credential inline and auto-select', async ({ app }) => {
    const credName = buildUniqueName('e2e-inline-cred')

    try {
      // Arrange
      await navigateToApiActionForm(app)
      await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()
      await app.getByRole('option', { name: /Create new credential/ }).click()

      // Act - Fill and submit the inline creation form
      const modal = app.getByRole('dialog')
      await modal.getByRole('textbox', { name: 'Credential name' }).fill(credName)
      // The pre-selected type is HTTP Bearer Token (first compatible type for API action)
      await expect(modal.getByRole('textbox', { name: 'Token' })).toBeVisible()
      await modal.getByRole('textbox', { name: 'Token' }).fill('inline-test-token')
      await modal.getByRole('button', { name: 'Create credential' }).click()

      // Assert - Success and auto-selected
      await expect(app.getByText('Credential created')).toBeVisible()
      await expect(app.getByRole('button', { name: 'Authentication credential', exact: true })).toContainText(credName)
    } finally {
      await deleteCredentialByName(app, credName)
    }
  })

  test('cancel inline creation closes modal', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)
    await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()
    await app.getByRole('option', { name: /Create new credential/ }).click()

    // Act - Click Cancel
    const modal = app.getByRole('dialog')
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Cancel' }).click()

    // Assert - Modal closed, no credential selected (shows placeholder text)
    await expect(modal).not.toBeVisible()
    await expect(app.getByRole('button', { name: 'Authentication credential', exact: true })).toContainText(
      'Select credential'
    )
  })

  test('inline creation validates required fields', async ({ app }) => {
    // Arrange
    await navigateToApiActionForm(app)
    await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()
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
    const credName = buildUniqueName('e2e-available-cred')

    try {
      // Arrange - Create a credential via inline modal
      await navigateToApiActionForm(app)
      await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()
      await app.getByRole('option', { name: /Create new credential/ }).click()

      const modal = app.getByRole('dialog')
      await modal.getByRole('textbox', { name: 'Credential name' }).fill(credName)
      await modal.getByRole('textbox', { name: 'Token' }).fill('availability-test-token')
      await modal.getByRole('button', { name: 'Create credential' }).click()
      await expect(app.getByText('Credential created')).toBeVisible()

      // Act - Open the selector dropdown again
      await app.getByRole('button', { name: 'Authentication credential', exact: true }).click()

      // Assert - Newly created credential appears in the list
      await expect(app.getByRole('option', { name: credName, exact: true })).toBeVisible()
    } finally {
      await deleteCredentialByName(app, credName)
    }
  })
})
