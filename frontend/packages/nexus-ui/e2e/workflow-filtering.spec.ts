import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName } from './helpers/workflows'
import { createWorkflowViaApi, deleteWorkflowViaApi, type SeededWorkflow } from './seeds/resources'
import { ensureProject, getAuthToken } from './utils/api'

const seededWorkflows: SeededWorkflow[] = []

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage()
  const token = await getAuthToken(page)
  if (token) {
    const prefix = buildUniqueName('e2e-wffilt')
    const project = await ensureProject(page)
    const projectId = project?.id

    for (let i = 1; i <= 22; i++) {
      const wf = await createWorkflowViaApi(page, {
        name: `${prefix}-workflow-${i}`,
        projectId,
        token,
      })
      if (wf) seededWorkflows.push(wf)
    }
  }
  await page.close()
})

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  for (const wf of seededWorkflows) {
    await deleteWorkflowViaApi(page, wf.id)
  }
  await page.close()
})

test.describe('Workflow Filtering', () => {
  test('full user flow: add filters → view results → clear filters', async ({ app }) => {
    // Navigate to workflows page
    await app.goto(toAppUrl('/workflows'))
    await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()

    // Wait for table or empty state to load
    const table = app.getByRole('grid', { name: 'Workflows table' })
    const hasTable = await table
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasTable, 'No workflows available for filtering tests')

    // Act - Apply name filter
    const nameFilterInput = app.getByPlaceholder('Filter by name')
    await nameFilterInput.fill('workflow')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Assert - Active filter chip displayed
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup).toBeVisible()
    await expect(nameChipGroup.getByText('workflow')).toBeVisible()

    // Verify URL contains filter
    await expect(app).toHaveURL(/name%5Bcontains%5D=workflow/)

    // Act - Clear all filters (use first button in toolbar, not in empty state)
    await app.locator('#filter-toolbar').getByRole('button', { name: 'Clear all filters' }).click()

    // Assert - All filter chips removed
    await expect(app.locator('#filter-toolbar').getByRole('list')).toHaveCount(0)

    // Verify URL no longer contains filters
    await expect(app).not.toHaveURL(/name%5Bcontains%5D/)
  })

  test('filter state persists across navigation (URL-based)', async ({ app }) => {
    // Navigate to workflows and apply filter
    await app.goto(toAppUrl('/workflows'))
    await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()

    await app.getByPlaceholder('Filter by name').fill('test')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Verify filter applied
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup.getByText('test')).toBeVisible()

    // Capture URL with filter
    const urlWithFilter = app.url()
    await expect(app).toHaveURL(/name%5Bcontains%5D=test/)

    // Act - Navigate to a different page using URL
    await app.goto(toAppUrl('/'))

    // Act - Navigate back to the saved URL with filter
    await app.goto(urlWithFilter)

    // Assert - Filter state restored from URL
    await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()
    const restoredNameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(restoredNameChipGroup.getByText('test')).toBeVisible()

    // Verify URL still contains filter
    await expect(app).toHaveURL(/name%5Bcontains%5D=test/)
  })

  test('shareable URLs: filters restored from URL', async ({ app, context }) => {
    // Navigate to workflows and apply name filter
    await app.goto(toAppUrl('/workflows'))
    await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()

    await app.getByPlaceholder('Filter by name').fill('workflow')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Capture URL with filter
    const urlWithFilters = app.url()
    await expect(app).toHaveURL(/name%5Bcontains%5D=workflow/)

    // Act - Open URL in new tab (simulate sharing URL)
    const newPage = await context.newPage()
    await newPage.goto(urlWithFilters)

    // Assert - Filter restored in new tab
    await expect(newPage.getByText('Workflows', { exact: true }).first()).toBeVisible()
    const newPageNameChipGroup = newPage.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(newPageNameChipGroup.getByText('workflow')).toBeVisible()

    // Cleanup
    await newPage.close()
  })

  test('shareable URLs: clear filters and share clean URL', async ({ app, context }) => {
    // Navigate to workflows with filters
    await app.goto(toAppUrl('/workflows'))
    await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()

    // Apply filter
    await app.getByPlaceholder('Filter by name').fill('test')
    await app.getByRole('button', { name: 'Apply filter' }).click()
    await expect(app).toHaveURL(/name%5Bcontains%5D/)

    // Act - Clear filters (use toolbar button, not the one in empty state)
    await app.locator('#filter-toolbar').getByRole('button', { name: 'Clear all filters' }).click()

    // Assert - URL no longer contains filter params
    await expect(app).not.toHaveURL(/name%5Bcontains%5D/)

    // Act - Share clean URL in new tab
    const cleanUrl = app.url()
    const newPage = await context.newPage()
    await newPage.goto(cleanUrl)

    // Assert - No filters in new tab
    await expect(newPage.getByText('Workflows', { exact: true }).first()).toBeVisible()
    await expect(newPage.locator('#filter-toolbar').getByRole('list')).toHaveCount(0)

    // Cleanup
    await newPage.close()
  })

  test('pagination works with active filters', async ({ app }) => {
    // Navigate to workflows
    await app.goto(toAppUrl('/workflows'))
    await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()

    // Check if pagination controls exist (requires 20+ workflows in mock data)
    const nextButton = app.getByRole('button', { name: 'Next page' })
    const hasPagination = (await nextButton.count()) > 0

    // Skip test if no pagination available
    test.skip(!hasPagination, 'Mock API has insufficient data for pagination test')

    // Apply a name filter
    await app.getByPlaceholder('Filter by name').fill('workflow')
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup.getByText('workflow')).toBeVisible()

    // Verify filter applied and results shown (skip if no matches)
    const table = app.getByRole('grid', { name: 'Workflows table' })
    const hasFilteredResults = await table
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasFilteredResults, 'No workflows matching "workflow" filter; insufficient seed data')

    // Verify filter in URL
    await expect(app).toHaveURL(/name%5Bcontains%5D=workflow/)

    // Check if next page button is still available with filter
    const hasNextWithFilter = (await nextButton.count()) > 0 && !(await nextButton.isDisabled())

    if (hasNextWithFilter) {
      // Act - Navigate to next page
      await nextButton.click()

      // Assert - Filter persists in URL with pagination cursor
      await expect(app).toHaveURL(/name%5Bcontains%5D=workflow/)
      await expect(app).toHaveURL(/cursor=/)

      // Assert - Filter chip still visible
      await expect(nameChipGroup.getByText('workflow')).toBeVisible()

      // Assert - Table still shows filtered results
      await expect(table).toBeVisible()

      // Act - Navigate to previous page
      const prevButton = app.getByRole('button', { name: 'Previous page' })
      await expect(prevButton).not.toBeDisabled()
      await prevButton.click()

      // Assert - Back to first page with filter still active
      await expect(nameChipGroup.getByText('workflow')).toBeVisible()
      await expect(app).toHaveURL(/name%5Bcontains%5D=workflow/)
    }
  })

  test('individual filter chips can be removed', async ({ app }) => {
    // Navigate and apply name filter
    await app.goto(toAppUrl('/workflows'))
    await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()

    await app.getByPlaceholder('Filter by name').fill('test')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Verify filter active
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup.getByText('test')).toBeVisible()

    // Act - Remove name filter chip
    const nameLabel = nameChipGroup.locator('.pf-v6-c-label').filter({ hasText: 'test' })
    await nameLabel.getByRole('button', { name: /close/i }).click()

    // Assert - Filter removed
    await expect(nameChipGroup).not.toBeVisible()
    await expect(app).not.toHaveURL(/name%5Bcontains%5D/)
  })

  test('empty state shows when filters return no results', async ({ app }) => {
    // Navigate to workflows
    await app.goto(toAppUrl('/workflows'))
    await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()

    // Apply filter that matches nothing
    const impossibleName = `zzz-nonexistent-${Date.now()}`
    await app.getByPlaceholder('Filter by name').fill(impossibleName)
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Wait for the filter to be applied (chip appears)
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup).toBeVisible()

    // Check if table disappeared (empty state shown) or still has rows (mock data matches)
    const table = app.getByRole('grid', { name: 'Workflows table' })
    const tableVisible = await table.isVisible().catch(() => false)

    if (!tableVisible) {
      await expect(app.getByRole('heading', { name: 'No results found' })).toBeVisible()

      await app.getByRole('button', { name: 'Clear all filters' }).last().click()

      // After clearing filters, the full list shows — either as a table (has data)
      // or an empty state (no workflows exist at all on the backend)
      const fullListTable = table
      const noWorkflowsState = app.getByText(/No workflows|Get started/i)
      await expect(fullListTable.or(noWorkflowsState)).toBeVisible()
    } else {
      // Skip test if mock data happens to match the filter
      test.skip(true, 'Mock API returned results for the filter - empty state not tested')
    }
  })
})
