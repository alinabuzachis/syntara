import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName } from './helpers/workflows'

test('user configures an integration and verifies it appears', async ({ app }) => {
  // Arrange - Navigate to integrations
  const integrationName = buildUniqueName('e2e-integration')
  await app.goto(toAppUrl('/configuration/integrations'))
  await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

  // Act - Open integration form and submit
  await app.getByRole('button', { name: 'Add integration' }).click()
  await expect(app.getByRole('heading', { name: 'Configure integration' })).toBeVisible()
  await app.getByLabel('Server name / ID').fill(integrationName)
  await app.getByLabel('API URL').fill('https://api.example.com')
  await app.getByLabel('API key').fill('test-key')
  await app.getByRole('button', { name: 'Add integration' }).click()

  // Assert - Integration shows in table
  await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()
  await expect(app).toHaveURL(/configuration\/integrations/)
  await app.getByPlaceholder('Search integrations...').fill(integrationName)
  const integrationRow = app.getByRole('row', { name: new RegExp(integrationName) })
  await expect(integrationRow).toBeVisible({ timeout: 30000 })
})
