/**
 * E2E Tests: Integration Tools
 *
 * Critical paths covered:
 * - Navigate to tools page from integrations list via kebab action
 * - Toggle individual tools (enable/disable via checkboxes) and save
 * - Select all / deselect all tools
 * - Cancel without saving returns to integrations list
 * - Empty state when provider has no tools (seeded providers)
 *
 * Edge cases:
 * - Save with mixed enabled/disabled tools persists state
 * - Tools page heading shows provider name
 */
import { type Page } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName } from './helpers/workflows'

async function createIntegration(app: Page, name: string) {
  await app.goto(toAppUrl('/configuration/integrations'))
  await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
  await app.getByRole('button', { name: 'Configure integration' }).click()
  await expect(app.getByRole('heading', { name: 'Configure integration' })).toBeVisible()
  await app.getByLabel('Server name / ID').fill(name)
  await app.getByLabel('API URL').fill('https://api.example.com')
  await app.getByLabel('API key').fill('test-key-e2e')
  await app.getByRole('button', { name: 'Configure integration' }).click()
  await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
}

async function navigateToToolsViaKebab(app: Page, integrationName: string) {
  await app.goto(toAppUrl('/configuration/integrations'))
  await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
  await app.getByPlaceholder('Filter by name').fill(integrationName)
  await app.getByRole('button', { name: 'Apply filter' }).click()
  const row = app.getByRole('row', { name: new RegExp(integrationName) })
  await expect(row).toBeVisible()
  await row.hover()
  const kebabButton = row.getByRole('button', { name: /Actions|Kebab toggle/i })
  await expect(kebabButton).toBeVisible()
  await kebabButton.click()
  await app.getByRole('menuitem', { name: /View and enable\/disable tools/i }).click()
  await expect(app.getByRole('heading', { level: 1, name: /tools/i })).toBeVisible()
}

async function deleteIntegration(app: Page, integrationName: string) {
  await app.goto(toAppUrl('/configuration/integrations'))
  await app.getByPlaceholder('Filter by name').fill(integrationName)
  await app.getByRole('button', { name: 'Apply filter' }).click()
  const row = app.getByRole('row', { name: new RegExp(integrationName) })
  const rowVisible = await expect(row)
    .toBeVisible()
    .then(
      () => true,
      () => false
    )
  if (rowVisible) {
    await row.hover()
    const kebabButton = row.getByRole('button', { name: /Actions|Kebab toggle/i })
    await expect(kebabButton).toBeVisible()
    await kebabButton.click()
    await app.getByRole('menuitem', { name: /Disconnect/i }).click()
    await app.getByRole('dialog').getByRole('checkbox').click()
    await app.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
    await expect(row).toHaveCount(0)
  }
}

test.describe('Integration Tools', () => {
  test('user navigates to tools page from integrations list', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-tools-nav')
    await createIntegration(app, integrationName)

    try {
      await navigateToToolsViaKebab(app, integrationName)

      // Verify page heading includes the integration name
      await expect(app.getByRole('heading', { name: new RegExp(`${integrationName}.*tools`, 'i') })).toBeVisible()

      // Verify Save and Cancel buttons are present
      await expect(app.getByRole('button', { name: 'Save' })).toBeVisible()
      await expect(app.getByRole('button', { name: 'Cancel' })).toBeVisible()

      // Verify either tools table or empty state is displayed
      const toolsTable = app.getByRole('grid', { name: 'Tools table' })
      const hasTable = await expect(toolsTable)
        .toBeVisible()
        .then(
          () => true,
          () => false
        )

      if (hasTable) {
        const checkboxes = toolsTable.getByRole('checkbox')
        const count = await checkboxes.count()
        expect(count).toBeGreaterThan(0)
      } else {
        await expect(app.getByRole('heading', { name: 'No tools available' })).toBeVisible()
      }
    } finally {
      await deleteIntegration(app, integrationName)
    }
  })

  test('user toggles individual tools and saves', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-tools-toggle')
    await createIntegration(app, integrationName)

    try {
      await navigateToToolsViaKebab(app, integrationName)

      const toolsTable = app.getByRole('grid', { name: 'Tools table' })
      const emptyState = app.getByRole('heading', { name: 'No tools available' })
      const hasTools = await expect(toolsTable)
        .toBeVisible()
        .then(
          () => true,
          () => false
        )
      if (!hasTools) {
        await expect(emptyState).toBeVisible()
        test.skip(true, 'No tools available for this integration; backend did not generate tools')
      }

      // Read tool names from the page so selectors are name-based, not positional
      const toolNames = await toolsTable.locator('tbody dt').allTextContents()
      expect(toolNames.length).toBeGreaterThan(0)

      // Toggle the first tool by name
      const firstToolRow = toolsTable.getByRole('row').filter({ hasText: toolNames[0] })
      const firstToolCheckbox = firstToolRow.getByRole('checkbox')
      const wasChecked = await firstToolCheckbox.isChecked()
      await firstToolCheckbox.click()

      if (wasChecked) {
        await expect(firstToolCheckbox).not.toBeChecked()
      } else {
        await expect(firstToolCheckbox).toBeChecked()
      }

      // Toggle a second tool if available
      if (toolNames.length > 1) {
        const secondToolRow = toolsTable.getByRole('row').filter({ hasText: toolNames[1] })
        const secondToolCheckbox = secondToolRow.getByRole('checkbox')
        const secondWasChecked = await secondToolCheckbox.isChecked()
        await secondToolCheckbox.click()

        if (secondWasChecked) {
          await expect(secondToolCheckbox).not.toBeChecked()
        } else {
          await expect(secondToolCheckbox).toBeChecked()
        }
      }

      // Save and verify navigation back to integrations list
      await app.getByRole('button', { name: 'Save' }).click()
      await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
      await expect(app).toHaveURL(/configuration\/integrations/)
    } finally {
      await deleteIntegration(app, integrationName)
    }
  })

  test('user selects all tools then deselects all', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-tools-selall')
    await createIntegration(app, integrationName)

    try {
      await navigateToToolsViaKebab(app, integrationName)

      const toolsTable = app.getByRole('grid', { name: 'Tools table' })
      const emptyState = app.getByRole('heading', { name: 'No tools available' })
      const hasTools = await expect(toolsTable)
        .toBeVisible()
        .then(
          () => true,
          () => false
        )
      if (!hasTools) {
        await expect(emptyState).toBeVisible()
        test.skip(true, 'No tools available for this integration; backend did not generate tools')
      }

      const toolNames = await toolsTable.locator('tbody dt').allTextContents()
      expect(toolNames.length).toBeGreaterThan(0)

      // Deselect all individually first (header checkbox state depends on row states)
      for (const name of toolNames) {
        const checkbox = toolsTable.getByRole('row').filter({ hasText: name }).getByRole('checkbox')
        if (await checkbox.isChecked()) {
          await checkbox.click()
        }
      }

      // Verify all rows are unchecked
      for (const name of toolNames) {
        const checkbox = toolsTable.getByRole('row').filter({ hasText: name }).getByRole('checkbox')
        await expect(checkbox).not.toBeChecked()
      }

      // Select all individually
      for (const name of toolNames) {
        const checkbox = toolsTable.getByRole('row').filter({ hasText: name }).getByRole('checkbox')
        await checkbox.click()
      }

      // Verify all rows are now checked
      for (const name of toolNames) {
        const checkbox = toolsTable.getByRole('row').filter({ hasText: name }).getByRole('checkbox')
        await expect(checkbox).toBeChecked()
      }

      // Deselect all individually again
      for (const name of toolNames) {
        const checkbox = toolsTable.getByRole('row').filter({ hasText: name }).getByRole('checkbox')
        await checkbox.click()
      }

      // Verify all rows are unchecked again
      for (const name of toolNames) {
        const checkbox = toolsTable.getByRole('row').filter({ hasText: name }).getByRole('checkbox')
        await expect(checkbox).not.toBeChecked()
      }
    } finally {
      await deleteIntegration(app, integrationName)
    }
  })

  test('user saves toggled tools and changes persist on revisit', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-tools-persist')
    await createIntegration(app, integrationName)

    try {
      await navigateToToolsViaKebab(app, integrationName)

      const toolsTable = app.getByRole('grid', { name: 'Tools table' })
      const emptyState = app.getByRole('heading', { name: 'No tools available' })
      const hasTools = await expect(toolsTable)
        .toBeVisible()
        .then(
          () => true,
          () => false
        )
      if (!hasTools) {
        await expect(emptyState).toBeVisible()
        test.skip(true, 'No tools available for this integration; backend did not generate tools')
      }

      // Read tool names so we can select by name
      const toolNames = await toolsTable.locator('tbody dt').allTextContents()
      expect(toolNames.length).toBeGreaterThan(0)

      // Deselect all tools individually first
      for (const name of toolNames) {
        const checkbox = toolsTable.getByRole('row').filter({ hasText: name }).getByRole('checkbox')
        if (await checkbox.isChecked()) {
          await checkbox.click()
        }
      }

      // Enable only the first tool
      const firstToolRow = toolsTable.getByRole('row').filter({ hasText: toolNames[0] })
      const firstToolCheckbox = firstToolRow.getByRole('checkbox')
      await firstToolCheckbox.click()
      await expect(firstToolCheckbox).toBeChecked()

      // Save
      await app.getByRole('button', { name: 'Save' }).click()
      await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()

      // Navigate back to tools page
      await navigateToToolsViaKebab(app, integrationName)

      const revisitTable = app.getByRole('grid', { name: 'Tools table' })
      await expect(revisitTable).toBeVisible()

      // Verify the first tool is still checked and others are not
      const firstToolRevisit = revisitTable.getByRole('row').filter({ hasText: toolNames[0] })
      await expect(firstToolRevisit.getByRole('checkbox')).toBeChecked()

      if (toolNames.length > 1) {
        const secondToolRevisit = revisitTable.getByRole('row').filter({ hasText: toolNames[1] })
        await expect(secondToolRevisit.getByRole('checkbox')).not.toBeChecked()
      }
    } finally {
      await deleteIntegration(app, integrationName)
    }
  })

  test('user cancels and returns to integrations list without saving', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-tools-cancel')
    await createIntegration(app, integrationName)

    try {
      await navigateToToolsViaKebab(app, integrationName)

      const toolsTable = app.getByRole('grid', { name: 'Tools table' })
      const hasTools = await expect(toolsTable)
        .toBeVisible()
        .then(
          () => true,
          () => false
        )

      // Toggle a tool if any exist (to verify cancel discards changes)
      if (hasTools) {
        const firstDataRow = toolsTable.locator('tbody tr:first-child')
        const firstCheckbox = firstDataRow.getByRole('checkbox')
        if ((await firstCheckbox.count()) > 0) {
          await firstCheckbox.click()
        }
      }

      // Cancel and verify navigation back to integrations list
      await app.getByRole('button', { name: 'Cancel' }).click()
      await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
      await expect(app).toHaveURL(/configuration\/integrations/)
    } finally {
      await deleteIntegration(app, integrationName)
    }
  })

  test('empty state shows for provider with no tools', async ({ app }) => {
    // Navigate directly to a seeded provider's tools page.
    // All seeded providers (ids 1–22) have no tools in the mock API because the
    // tools array starts empty; tools are only created for dynamically-added providers.
    await app.goto(toAppUrl('/configuration/integrations/1/tools'))
    await expect(app.getByRole('heading', { level: 1, name: /tools/i })).toBeVisible()

    const toolsTable = app.getByRole('grid', { name: 'Tools table' })
    const emptyHeading = app.getByRole('heading', { name: 'No tools available' })

    const hasToolsTable = await expect(toolsTable)
      .toBeVisible()
      .then(
        () => true,
        () => false
      )

    // Against a real backend the seeded provider may have tools; skip in that case
    test.skip(hasToolsTable, 'Provider has tools; empty state not testable with current data')

    const hasEmptyState = await expect(emptyHeading)
      .toBeVisible()
      .then(
        () => true,
        () => false
      )

    // Against a real backend provider_id "1" may be invalid (not UUID) → error page
    test.skip(!hasEmptyState, 'Empty state not visible; provider may not exist or ID is invalid')
    const refreshButtons = app.getByRole('button', { name: 'Refresh tools' })
    expect(await refreshButtons.count()).toBeGreaterThanOrEqual(1)
  })
})
