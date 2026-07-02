import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName } from './helpers/workflows'
import { createIntegrationViaApi, deleteIntegrationViaApi, type SeededIntegration } from './seeds/resources'
import { getAuthToken } from './utils/api'

test('user configures an integration and verifies it appears', async ({ app }) => {
  const integrationName = buildUniqueName('e2e-integration')
  let seededIntegration: SeededIntegration | null = null

  try {
    const token = await getAuthToken(app)
    seededIntegration = await createIntegrationViaApi(app, { name: integrationName, token: token ?? undefined })
    expect(seededIntegration).not.toBeNull()

    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()

    await app.getByPlaceholder('Filter by name').fill(integrationName)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const integrationRow = app.getByRole('row', { name: new RegExp(integrationName) })
    await expect(integrationRow).toBeVisible({ timeout: 30000 })
  } finally {
    if (seededIntegration) {
      await deleteIntegrationViaApi(app, seededIntegration.id)
    }
  }
})
