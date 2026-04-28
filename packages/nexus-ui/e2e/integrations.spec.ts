import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName } from './helpers/workflows'

test('user configures an integration and verifies it appears', async ({ app }) => {
  // Arrange - Navigate to integrations
  const integrationName = buildUniqueName('e2e-integration')
  await app.goto(toAppUrl('/configuration/integrations'))
  await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()

  try {
    // Act - Open integration form and submit
    await app.getByRole('button', { name: 'Add integration' }).first().click()
    await expect(app.getByRole('heading', { name: 'Configure integration' })).toBeVisible()
    await app.getByLabel('Server name / ID').fill(integrationName)
    await app.getByLabel('API URL').fill('https://api.example.com')
    await app.getByLabel('API key').fill('test-key')
    await app.getByRole('button', { name: 'Add integration' }).first().click()

    // Assert - Integration shows in table
    await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
    await expect(app).toHaveURL(/configuration\/integrations/)
    await app.getByPlaceholder('Filter by name').fill(integrationName)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const integrationRow = app.getByRole('row', { name: new RegExp(integrationName) })
    await expect(integrationRow).toBeVisible({ timeout: 30000 })
  } finally {
    // Cleanup - delete the integration if it exists
    await app.goto(toAppUrl('/configuration/integrations'))
    await app.getByPlaceholder('Filter by name').fill(integrationName)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const row = app.getByRole('row', { name: new RegExp(integrationName) })
    if ((await row.count()) > 0) {
      await row
        .getByRole('button', { name: /Actions|Kebab toggle/i })
        .first()
        .click({ force: true })
      await app.getByRole('menuitem', { name: /Uninstall/i }).click()
      await app.getByRole('button', { name: 'Delete' }).click()
    }
  }
})
