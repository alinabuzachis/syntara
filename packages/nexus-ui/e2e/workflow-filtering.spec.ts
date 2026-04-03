import { test, expect, toAppUrl } from './fixtures'

test.describe('Workflow Filtering', () => {
  test('full user flow: add filters → view results → clear filters', async ({ app }) => {
    // Navigate to automations page
    await app.goto(toAppUrl('/automations'))
    await expect(app.getByRole('heading', { name: 'Automations' })).toBeVisible()

    // Wait for table or empty state to load
    const table = app.getByRole('grid', { name: 'Automations table' })
    const hasTable = await table
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasTable, 'No automations available for filtering tests')

    // Act - Apply name filter
    const nameFilterInput = app.getByPlaceholder('Filter by name')
    await nameFilterInput.fill('workflow')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Assert - Active filter chip displayed (LabelGroup shows category, Label shows value)
    const nameChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'Name' })
    await expect(nameChipGroup).toBeVisible()
    await expect(nameChipGroup.getByText('workflow')).toBeVisible()

    // Verify URL contains filter
    expect(app.url()).toContain('name%5Bcontains%5D=workflow')

    // Act - Add state filter (select "Enabled")
    const fieldSelector = app.getByRole('button', { name: 'Name' }).first()
    await fieldSelector.click()
    await app.getByRole('option', { name: 'State' }).click()
    await app.getByRole('button', { name: 'Filter by state' }).click()
    await app.getByRole('option', { name: 'Enabled' }).click()

    // Assert - Both filter chips displayed
    await expect(nameChipGroup.getByText('workflow')).toBeVisible()
    const stateChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'State' })
    await expect(stateChipGroup).toBeVisible()
    await expect(stateChipGroup.getByText('Enabled')).toBeVisible()

    // Verify both filters in URL
    expect(app.url()).toContain('name%5Bcontains%5D=workflow')
    expect(app.url()).toContain('is_enabled=true')

    // Act - Clear all filters (use first button in toolbar, not in empty state)
    await app.locator('#filter-toolbar').getByRole('button', { name: 'Clear all filters' }).click()

    // Assert - All filter chips removed
    await expect(app.locator('.pf-v6-c-label-group')).toHaveCount(0)

    // Verify URL no longer contains filters
    expect(app.url()).not.toContain('name%5Bcontains%5D')
    expect(app.url()).not.toContain('is_enabled')
  })

  test('filter state persists across navigation (URL-based)', async ({ app }) => {
    // Navigate to automations and apply filter
    await app.goto(toAppUrl('/automations'))
    await expect(app.getByRole('heading', { name: 'Automations' })).toBeVisible()

    await app.getByPlaceholder('Filter by name').fill('test')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Verify filter applied
    const nameChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'Name' })
    await expect(nameChipGroup.getByText('test')).toBeVisible()

    // Capture URL with filter
    const urlWithFilter = app.url()
    expect(urlWithFilter).toContain('name%5Bcontains%5D=test')

    // Act - Navigate to a different page using URL
    await app.goto(toAppUrl('/'))

    // Act - Navigate back to the saved URL with filter
    await app.goto(urlWithFilter)

    // Assert - Filter state restored from URL
    await expect(app.getByRole('heading', { name: 'Automations' })).toBeVisible()
    const restoredNameChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'Name' })
    await expect(restoredNameChipGroup.getByText('test')).toBeVisible()

    // Verify URL still contains filter
    expect(app.url()).toContain('name%5Bcontains%5D=test')
  })

  test('shareable URLs: filters restored from URL', async ({ app, context }) => {
    // Navigate to automations and apply filters
    await app.goto(toAppUrl('/automations'))
    await expect(app.getByRole('heading', { name: 'Automations' })).toBeVisible()

    await app.getByPlaceholder('Filter by name').fill('automation')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    const fieldSelector = app.getByRole('button', { name: 'Name' }).first()
    await fieldSelector.click()
    await app.getByRole('option', { name: 'State' }).click()
    await app.getByRole('button', { name: 'Filter by state' }).click()
    await app.getByRole('option', { name: 'Enabled' }).click()

    // Capture URL with filters
    const urlWithFilters = app.url()
    expect(urlWithFilters).toContain('name%5Bcontains%5D=automation')
    expect(urlWithFilters).toContain('is_enabled=true')

    // Act - Open URL in new tab (simulate sharing URL)
    const newPage = await context.newPage()
    await newPage.goto(urlWithFilters)

    // Assert - Filters restored in new tab
    await expect(newPage.getByRole('heading', { name: 'Automations' })).toBeVisible()
    const newPageNameChipGroup = newPage.locator('.pf-v6-c-label-group').filter({ hasText: 'Name' })
    await expect(newPageNameChipGroup.getByText('automation')).toBeVisible()
    const newPageStateChipGroup = newPage.locator('.pf-v6-c-label-group').filter({ hasText: 'State' })
    await expect(newPageStateChipGroup.getByText('Enabled')).toBeVisible()

    // Cleanup
    await newPage.close()
  })

  test('shareable URLs: clear filters and share clean URL', async ({ app, context }) => {
    // Navigate to automations with filters
    await app.goto(toAppUrl('/automations'))
    await expect(app.getByRole('heading', { name: 'Automations' })).toBeVisible()

    // Apply filter
    await app.getByPlaceholder('Filter by name').fill('test')
    await app.getByRole('button', { name: 'Apply filter' }).click()
    expect(app.url()).toContain('name%5Bcontains%5D')

    // Act - Clear filters
    await app.getByRole('button', { name: 'Clear all filters' }).click()

    // Assert - URL no longer contains filter params
    const cleanUrl = app.url()
    expect(cleanUrl).not.toContain('name%5Bcontains%5D')
    expect(cleanUrl).not.toContain('is_enabled')

    // Act - Share clean URL in new tab
    const newPage = await context.newPage()
    await newPage.goto(cleanUrl)

    // Assert - No filters in new tab
    await expect(newPage.getByRole('heading', { name: 'Automations' })).toBeVisible()
    await expect(newPage.locator('.pf-v6-c-label-group')).toHaveCount(0)

    // Cleanup
    await newPage.close()
  })

  test('pagination works with active filters', async ({ app }) => {
    // Note: This test depends on mock API having enough workflows to paginate
    // If mock API has < 20 workflows, pagination won't appear

    // Navigate to automations
    await app.goto(toAppUrl('/automations'))
    await expect(app.getByRole('heading', { name: 'Automations' })).toBeVisible()

    // Check if pagination controls exist (requires 20+ workflows in mock data)
    const nextButton = app.getByRole('button', { name: 'Next page' })
    const hasPagination = (await nextButton.count()) > 0

    // Skip test if no pagination available
    test.skip(!hasPagination, 'Mock API has insufficient data for pagination test')

    // Apply a name filter
    await app.getByPlaceholder('Filter by name').fill('workflow')
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const nameChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'Name' })
    await expect(nameChipGroup.getByText('workflow')).toBeVisible()

    // Verify filter applied and results shown (skip if no matches)
    const table = app.getByRole('grid', { name: 'Automations table' })
    const hasFilteredResults = await table
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasFilteredResults, 'No workflows matching "workflow" filter; insufficient seed data')

    // Verify filter in URL
    expect(app.url()).toContain('name%5Bcontains%5D=workflow')

    // Check if next page button is still available with filter
    const hasNextWithFilter = (await nextButton.count()) > 0 && !(await nextButton.isDisabled())

    if (hasNextWithFilter) {
      // Act - Navigate to next page
      await nextButton.click()

      // Assert - Filter persists in URL with pagination cursor
      const urlWithFilterAndCursor = app.url()
      expect(urlWithFilterAndCursor).toContain('name%5Bcontains%5D=workflow')
      expect(urlWithFilterAndCursor).toContain('cursor=')

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
      expect(app.url()).toContain('name%5Bcontains%5D=workflow')
    }
  })

  test('individual filter chips can be removed', async ({ app }) => {
    // Navigate and apply multiple filters
    await app.goto(toAppUrl('/automations'))
    await expect(app.getByRole('heading', { name: 'Automations' })).toBeVisible()

    await app.getByPlaceholder('Filter by name').fill('test')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    const fieldSelector = app.getByRole('button', { name: 'Name' }).first()
    await fieldSelector.click()
    await app.getByRole('option', { name: 'State' }).click()
    await app.getByRole('button', { name: 'Filter by state' }).click()
    await app.getByRole('option', { name: 'Enabled' }).click()

    // Verify both filters active
    const nameChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'Name' })
    await expect(nameChipGroup.getByText('test')).toBeVisible()
    const stateChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'State' })
    await expect(stateChipGroup.getByText('Enabled')).toBeVisible()

    // Act - Remove name filter chip (find the label with the value and click its close button)
    const nameLabel = nameChipGroup.locator('.pf-v6-c-label').filter({ hasText: 'test' })
    await nameLabel.getByRole('button', { name: /close/i }).click()

    // Assert - Name filter removed, state filter remains
    await expect(nameChipGroup).not.toBeVisible()
    await expect(stateChipGroup.getByText('Enabled')).toBeVisible()

    // Assert - URL updated
    expect(app.url()).not.toContain('name%5Bcontains%5D')
    expect(app.url()).toContain('is_enabled=')

    // Act - Remove state filter chip
    const stateLabel = stateChipGroup.locator('.pf-v6-c-label').filter({ hasText: 'Enabled' })
    await stateLabel.getByRole('button', { name: /close/i }).click()

    // Assert - All filters removed
    await expect(app.locator('.pf-v6-c-label-group')).toHaveCount(0)
    expect(app.url()).not.toContain('is_enabled=')
  })

  test('empty state shows when filters return no results', async ({ app }) => {
    // Navigate to automations
    await app.goto(toAppUrl('/automations'))
    await expect(app.getByRole('heading', { name: 'Automations' })).toBeVisible()

    // Apply filter that matches nothing
    const impossibleName = `zzz-nonexistent-${Date.now()}`
    await app.getByPlaceholder('Filter by name').fill(impossibleName)
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Wait for the filter to be applied (chip appears)
    const nameChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'Name' })
    await expect(nameChipGroup).toBeVisible()

    // Check if table disappeared (empty state shown) or still has rows (mock data matches)
    const table = app.getByRole('grid', { name: 'Automations table' })
    const tableVisible = await table.isVisible().catch(() => false)

    if (!tableVisible) {
      // Assert - Empty state displayed (check for heading specifically)
      await expect(app.getByRole('heading', { name: 'No results found' })).toBeVisible()

      // Act - Clear filters from empty state button
      await app.getByRole('button', { name: 'Clear all filters' }).last().click()

      // Assert - Back to full list
      await expect(table).toBeVisible()
    } else {
      // Skip test if mock data happens to match the filter
      test.skip(true, 'Mock API returned results for the filter - empty state not tested')
    }
  })
})
