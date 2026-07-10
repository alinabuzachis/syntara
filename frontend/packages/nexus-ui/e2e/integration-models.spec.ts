/**
 * E2E Tests: LLM Provider Models Tab
 *
 * Critical paths covered:
 * - Navigate to models tab from integrations list
 * - Toggle individual models (enable/disable via checkboxes) and save
 * - Select all / deselect all models
 * - Set a model as default via kebab menu
 * - Remove default model via kebab menu
 * - Filter models by name
 * - Save model changes and verify persistence on revisit
 *
 * Edge cases:
 * - Filter with no results shows empty filter state
 * - Clear filter restores full list
 */
import { type Page } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName } from './helpers/workflows'
import { deleteIntegrationViaApi, type SeededIntegration } from './seeds/resources'
import { apiRequest, getAuthToken } from './utils/api'

async function createLLMIntegrationViaApi(
  app: Page,
  options: { name: string; token?: string }
): Promise<SeededIntegration | null> {
  try {
    const token = options.token ?? (await getAuthToken(app))
    if (!token) return null

    const resp = await apiRequest(app, 'post', '/integrations', {
      token,
      data: {
        name: options.name,
        integration_type: 'llm_provider',
        configuration: {
          integration_type: 'llm_provider',
          provider_hint: 'custom',
          base_url: `https://${options.name}.example.com/v1`,
        },
        scope: 'global',
        discovered_models: [
          {
            model_id: 'model-alpha',
            name: 'Alpha Model',
            description: 'First test model',
            enabled: true,
            is_default: true,
          },
          {
            model_id: 'model-beta',
            name: 'Beta Model',
            description: 'Second test model',
            enabled: true,
            is_default: false,
          },
          {
            model_id: 'model-gamma',
            name: 'Gamma Model',
            description: 'Third test model',
            enabled: false,
            is_default: false,
          },
        ],
      },
    })
    if (!resp.ok()) return null
    const integration = (await resp.json()) as { id: string; name: string }
    return { id: integration.id, name: integration.name }
  } catch {
    return null
  }
}

async function createLLMIntegration(app: Page, name: string): Promise<SeededIntegration> {
  const token = await getAuthToken(app)
  const integration = await createLLMIntegrationViaApi(app, { name, token: token ?? undefined })
  if (!integration) throw new Error(`Failed to create LLM integration "${name}" via API`)
  return integration
}

async function navigateToModelsTab(app: Page, integrationName: string) {
  await app.goto(toAppUrl('/configuration/integrations'))
  await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
  await app.getByPlaceholder('Filter by name').fill(integrationName)
  await app.getByRole('button', { name: 'Apply filter' }).click()
  const row = app.getByRole('row', { name: new RegExp(integrationName) })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: integrationName, exact: true }).click()
  await app.getByRole('tab', { name: /Enabled resources/i }).click()
}

test.describe('LLM Provider Models Tab', () => {
  test('navigates to models tab and displays models', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-nav')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      const modelsTable = app.locator('[aria-label="Integration models"]')
      await expect(modelsTable).toBeVisible()
      await expect(app.getByRole('button', { name: 'Save model changes' })).toBeVisible()
      const checkboxes = modelsTable.getByRole('checkbox')
      const count = await checkboxes.count()
      expect(count).toBeGreaterThan(0)
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })

  test('toggles individual model enable/disable via checkbox', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-toggle')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      const modelsTable = app.locator('[aria-label="Integration models"]')
      await expect(modelsTable).toBeVisible()

      const gammaRow = modelsTable.getByRole('row').filter({ hasText: 'Gamma Model' })
      const gammaCheckbox = gammaRow.getByRole('checkbox')

      await expect(gammaCheckbox).not.toBeChecked()
      await gammaCheckbox.click()
      await expect(gammaCheckbox).toBeChecked()

      await gammaCheckbox.click()
      await expect(gammaCheckbox).not.toBeChecked()
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })

  test('select all and deselect all models', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-selall')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      const modelsTable = app.locator('[aria-label="Integration models"]')
      await expect(modelsTable).toBeVisible()

      const selectAllCheckbox = modelsTable.locator('thead').getByRole('checkbox')
      await selectAllCheckbox.click()

      const bodyCheckboxes = modelsTable.locator('tbody').getByRole('checkbox')
      const count = await bodyCheckboxes.count()
      for (let i = 0; i < count; i++) {
        await expect(bodyCheckboxes.nth(i)).toBeChecked()
      }

      await selectAllCheckbox.click()

      for (let i = 0; i < count; i++) {
        await expect(bodyCheckboxes.nth(i)).not.toBeChecked()
      }
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })

  test('sets a model as default via kebab menu', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-default')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      const modelsTable = app.locator('[aria-label="Integration models"]')
      await expect(modelsTable).toBeVisible()

      const betaRow = modelsTable.getByRole('row').filter({ hasText: 'Beta Model' })
      await betaRow.getByRole('button', { name: /Actions/i }).click()
      await app.getByRole('menuitem', { name: /Set as default model/i }).click()

      await expect(betaRow.getByText('Default')).toBeVisible()
      const alphaRow = modelsTable.getByRole('row').filter({ hasText: 'Alpha Model' })
      await expect(alphaRow.getByText('Default')).not.toBeVisible()
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })

  test('removes default model via kebab menu', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-rmdefault')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      const modelsTable = app.locator('[aria-label="Integration models"]')
      await expect(modelsTable).toBeVisible()

      const alphaRow = modelsTable.getByRole('row').filter({ hasText: 'Alpha Model' })
      await expect(alphaRow.getByText('Default')).toBeVisible()

      await alphaRow.getByRole('button', { name: /Actions/i }).click()
      await app.getByRole('menuitem', { name: /Remove default model/i }).click()

      await expect(alphaRow.getByText('Default')).not.toBeVisible()
      await expect(modelsTable.getByText('Default')).not.toBeVisible()
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })

  test('saves model changes and verifies persistence on revisit @pr-check', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-save')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      const modelsTable = app.locator('[aria-label="Integration models"]')
      await expect(modelsTable).toBeVisible()

      const gammaRow = modelsTable.getByRole('row').filter({ hasText: 'Gamma Model' })
      const gammaCheckbox = gammaRow.getByRole('checkbox')
      await expect(gammaCheckbox).not.toBeChecked()
      await gammaCheckbox.click()
      await expect(gammaCheckbox).toBeChecked()

      await app.getByRole('button', { name: 'Save model changes' }).click()
      await expect(app.getByText('Models updated')).toBeVisible()

      await navigateToModelsTab(app, name)

      const revisitTable = app.locator('[aria-label="Integration models"]')
      await expect(revisitTable).toBeVisible()

      const gammaRevisit = revisitTable.getByRole('row').filter({ hasText: 'Gamma Model' })
      await expect(gammaRevisit.getByRole('checkbox')).toBeChecked()
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })

  test('filters models by name', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-filter')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      const modelsTable = app.locator('[aria-label="Integration models"]')
      await expect(modelsTable).toBeVisible()

      await app.getByPlaceholder('Filter by name').fill('Alpha')
      await app.getByRole('button', { name: 'Apply filter' }).click()

      const visibleRows = modelsTable.locator('tbody tr')
      await expect(visibleRows).toHaveCount(1)
      await expect(visibleRows.nth(0)).toContainText('Alpha Model')
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })

  test('shows empty filter state when no models match', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-noresults')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      await expect(app.locator('[aria-label="Integration models"]')).toBeVisible()

      await app.getByPlaceholder('Filter by name').fill('nonexistent-xyz-model')
      await app.getByRole('button', { name: 'Apply filter' }).click()

      await expect(app.getByRole('heading', { name: /No results found/i })).toBeVisible()
      await expect(app.getByRole('button', { name: /Clear all filters/i }).last()).toBeVisible()
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })

  test('clears filter and restores full list', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-clearfilter')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      const modelsTable = app.locator('[aria-label="Integration models"]')
      await expect(modelsTable).toBeVisible()

      const initialRows = await modelsTable.locator('tbody tr').count()

      await app.getByPlaceholder('Filter by name').fill('Alpha')
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await expect(modelsTable.locator('tbody tr')).toHaveCount(1)

      await app.getByRole('button', { name: /Clear all filters/i }).click()
      await expect(modelsTable.locator('tbody tr')).toHaveCount(initialRows)
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })

  test('shows error toast when save fails', async ({ app }) => {
    const name = buildUniqueName('e2e-llm-saveerr')
    const integration = await createLLMIntegration(app, name)

    try {
      await navigateToModelsTab(app, name)

      const modelsTable = app.locator('[aria-label="Integration models"]')
      await expect(modelsTable).toBeVisible()

      const gammaRow = modelsTable.getByRole('row').filter({ hasText: 'Gamma Model' })
      await gammaRow.getByRole('checkbox').click()

      await app.route('**/models/bulk_update', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Internal server error' }),
        })
      )

      await app.getByRole('button', { name: 'Save model changes' }).click()
      await expect(app.getByText('Failed to update models')).toBeVisible()
    } finally {
      await deleteIntegrationViaApi(app, integration.id)
    }
  })
})
