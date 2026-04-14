import type { Page } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'
import { createTestCredential, deleteCredentialByName } from './helpers/credentials'
import { buildUniqueName } from './helpers/workflows'

/** Navigate to credential types list and click a type row to open its detail page */
async function navigateToTypeDetail(app: Page, typeName: string) {
  await app.goto(toAppUrl('/configuration/credential-types'))
  await expect(app.getByRole('heading', { name: 'Credential Types', level: 1 })).toBeVisible()
  const table = app.getByRole('grid', { name: 'Credential types table' })
  await table.getByRole('row', { name: new RegExp(typeName) }).click()
  await expect(app.getByRole('heading', { name: typeName, level: 1 })).toBeVisible()
}

test.describe('Credential Types Management', () => {
  // Credential Types page removed for GA; re-enable when CRUD support is added
  test.skip(true, 'Credential Types page removed for GA')

  test('displays credential types list with all columns', async ({ app }) => {
    await app.goto(toAppUrl('/configuration/credential-types'))
    await expect(app.getByRole('heading', { name: 'Credential Types', level: 1 })).toBeVisible()

    const table = app.getByRole('grid', { name: 'Credential types table' })
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /Name/ })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /Credentials/ })).toBeVisible()
  })

  test('lists all expected credential types', async ({ app }) => {
    await app.goto(toAppUrl('/configuration/credential-types'))
    await expect(app.getByRole('heading', { name: 'Credential Types', level: 1 })).toBeVisible()

    // Assert each expected type exists (without hardcoding exact total count)
    const table = app.getByRole('grid', { name: 'Credential types table' })
    await expect(table.getByRole('row', { name: /HTTP Bearer Token/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /HTTP Basic Auth/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /AAP API Credentials/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /LLM Provider/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /SSH Key/ })).toBeVisible()
  })

  test('navigates to credential type detail page', async ({ app }) => {
    await app.goto(toAppUrl('/configuration/credential-types'))
    await expect(app.getByRole('heading', { name: 'Credential Types', level: 1 })).toBeVisible()

    const table = app.getByRole('grid', { name: 'Credential types table' })
    await table.getByRole('row', { name: /HTTP Basic Auth/ }).click()

    await expect(app).toHaveURL(/configuration\/credential-types\//)
    await expect(app.getByRole('heading', { name: 'HTTP Basic Auth', level: 1 })).toBeVisible()
  })

  test('shows schema fields on type detail page', async ({ app }) => {
    await navigateToTypeDetail(app, 'HTTP Bearer Token')

    await expect(app.getByText('Credentials Using')).toBeVisible()
    await expect(app.getByText('Input Fields')).toBeVisible()

    // Input fields JSON contains field definitions
    await expect(app.getByText(/"token"/)).toBeVisible()
  })

  test('shows credentials using this type', async ({ app }) => {
    // Create a credential so we have at least one for this type
    const name = await createTestCredential(app, { prefix: 'e2e-type-creds' })
    try {
      await navigateToTypeDetail(app, 'HTTP Bearer Token')
      await app.getByRole('tab', { name: /Credentials/ }).click()

      const table = app.getByRole('grid', { name: 'Credentials for this type' })
      const hasTable = await table
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false)
      test.skip(!hasTable, 'No credentials available for this type')

      // Filter to find our credential
      await app.getByPlaceholder('Filter by keyword').fill(name)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await expect(table.getByRole('row', { name: new RegExp(name) })).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('navigates to credential from type detail', async ({ app }) => {
    const name = await createTestCredential(app, { prefix: 'e2e-type-nav' })
    try {
      await navigateToTypeDetail(app, 'HTTP Bearer Token')
      await app.getByRole('tab', { name: /Credentials/ }).click()

      // Filter to find our credential
      await app.getByPlaceholder('Filter by keyword').fill(name)
      await app.getByRole('button', { name: 'Apply filter' }).click()

      const table = app.getByRole('grid', { name: 'Credentials for this type' })
      await table.getByRole('row', { name: new RegExp(name) }).click()

      await expect(app).toHaveURL(/configuration\/credentials\//)
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('shows empty state when no credentials match filter', async ({ app }) => {
    await navigateToTypeDetail(app, 'HTTP Basic Auth')
    await app.getByRole('tab', { name: /Credentials/ }).click()

    await app.getByPlaceholder('Filter by keyword').fill('nonexistent-credential-zzz')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    await expect(app.getByRole('heading', { name: 'No results found' })).toBeVisible()
    await expect(app.getByText('No results match the filter criteria')).toBeVisible()
  })

  test('back navigation returns to credential types list', async ({ app }) => {
    await navigateToTypeDetail(app, 'HTTP Basic Auth')

    await app.getByRole('button', { name: 'Back to credential types' }).click()

    await expect(app).toHaveURL(/configuration\/credential-types$/)
    await expect(app.getByRole('heading', { name: 'Credential Types', level: 1 })).toBeVisible()
  })

  test('credential count updates after creating credential', async ({ app }) => {
    // Record the current count for HTTP Bearer Token
    await app.goto(toAppUrl('/configuration/credential-types'))
    await expect(app.getByRole('heading', { name: 'Credential Types', level: 1 })).toBeVisible()
    const bearerRow = app.getByRole('row', { name: /HTTP Bearer Token/ })
    await expect(bearerRow).toBeVisible()
    const beforeCount = Number(await bearerRow.locator('td[data-label="Credentials"]').textContent())

    // Create a new bearer token credential
    const name = buildUniqueName('e2e-count-test')
    await app.goto(toAppUrl('/configuration/credentials'))
    await expect(app.getByRole('heading', { name: 'Credentials', level: 1 })).toBeVisible()
    await app.getByRole('button', { name: 'Create credential' }).click()

    const modal = app.getByRole('dialog')
    await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Bearer Token' })
    await modal.getByRole('textbox', { name: 'Token' }).fill('test-token-for-count')
    await modal.getByRole('button', { name: 'Create credential' }).click()
    await expect(app.getByText('Credential created')).toBeVisible()

    try {
      // Assert count increased
      await app.goto(toAppUrl('/configuration/credential-types'))
      await expect(app.getByRole('heading', { name: 'Credential Types', level: 1 })).toBeVisible()
      const updatedBearerRow = app.getByRole('row', { name: /HTTP Bearer Token/ })
      await expect(updatedBearerRow).toBeVisible()
      const afterCount = Number(await updatedBearerRow.locator('td[data-label="Credentials"]').textContent())
      expect(afterCount).toBeGreaterThan(beforeCount)
    } finally {
      await deleteCredentialByName(app, name)
    }
  })
})
