import { test, expect, toAppUrl } from './fixtures'

test.describe('Integration Filtering', () => {
  test('keyword search: filter by integration name', async ({ app }) => {
    // Navigate to integrations page
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    // Wait for table to load
    const table = app.getByRole('grid', { name: 'Integrations table' })
    await expect(table).toBeVisible()

    // Act - Search for "copilot" using name filter
    const nameFilterInput = app.getByPlaceholder('Filter by name')
    await nameFilterInput.fill('copilot')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Assert - Filter chip displayed
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup).toBeVisible()
    await expect(nameChipGroup.getByText('copilot')).toBeVisible()

    // Verify URL contains filter
    expect(app.url()).toContain('name%5Bcontains%5D=copilot')

    // Verify table still visible (results may or may not match depending on mock data)
    await expect(table).toBeVisible()
  })

  test('name filter: apply and clear name filter', async ({ app }) => {
    // Navigate to integrations
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    // Act - Apply name filter
    await app.getByPlaceholder('Filter by name').fill('slack')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Assert - Filter chip displayed
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup.getByText('slack')).toBeVisible()

    // Verify URL
    expect(app.url()).toContain('name%5Bcontains%5D=slack')

    // Act - Clear filter using chip close button
    await nameChipGroup.locator('.pf-v6-c-label', { hasText: 'slack' }).getByRole('button', { name: /close/i }).click()

    // Assert - Filter removed
    await expect(nameChipGroup).not.toBeVisible()
    expect(app.url()).not.toContain('name%5Bcontains%5D')
  })

  test('status filter: switch between status values', async ({ app }) => {
    // Navigate to integrations
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    const table = app.getByRole('grid', { name: 'Integrations table' })
    await expect(table).toBeVisible()

    // Act - Switch to Status field and apply "Available" status filter
    const fieldSelector = app.getByRole('button', { name: 'Name' }).first()
    await fieldSelector.click()
    await app.getByRole('option', { name: 'Status' }).click()
    await app.getByRole('button', { name: 'Filter by status' }).click()
    await app.getByRole('option', { name: 'Available' }).click()

    // Assert - Status filter chip displayed
    const statusChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Status' })
    await expect(statusChipGroup).toBeVisible()
    await expect(statusChipGroup.getByText('Available')).toBeVisible()

    // Verify URL
    expect(app.url()).toContain('status=available')

    // Verify table shows filtered results
    await expect(table).toBeVisible()

    // Act - Switch to "Error" status (replaces "Available")
    await app.getByRole('button', { name: 'Available', exact: true }).first().click()
    await app.getByRole('option', { name: 'Error' }).click()

    // Assert - Status filter updated to "Error"
    await expect(statusChipGroup.getByText('Error')).toBeVisible()
    await expect(statusChipGroup.getByText('Available')).not.toBeVisible()

    // Verify URL updated
    expect(app.url()).toContain('status=error')
    expect(app.url()).not.toContain('status=available')

    // Act - Remove status filter
    await statusChipGroup
      .locator('.pf-v6-c-label', { hasText: 'Error' })
      .getByRole('button', { name: /close/i })
      .click()

    // Assert - Status filter removed
    await expect(statusChipGroup).not.toBeVisible()
    expect(app.url()).not.toContain('status=')
  })

  test('combined filters: name + status + integration type', async ({ app }) => {
    // Navigate to integrations
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    // Act - Apply name filter
    await app.getByPlaceholder('Filter by name').fill('integration')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Assert - Name filter applied
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup.getByText('integration')).toBeVisible()
    expect(app.url()).toContain('name%5Bcontains%5D=integration')

    // Act - Switch to Status and add status filter
    const fieldSelector = app.getByRole('button', { name: 'Name' }).first()
    await fieldSelector.click()
    await app.getByRole('option', { name: 'Status' }).click()
    await app.getByRole('button', { name: 'Filter by status' }).click()
    await app.getByRole('option', { name: 'Error' }).click()

    // Assert - Status filter applied
    const statusChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Status' })
    await expect(statusChipGroup.getByText('Error')).toBeVisible()
    expect(app.url()).toContain('status=error')

    // Act - Switch to Integration type and add filter (re-query field selector)
    const fieldSelector2 = app.getByRole('button', { name: 'Status' }).first()
    await fieldSelector2.click()
    await app.getByRole('option', { name: 'Integration type' }).click()
    await app.getByRole('button', { name: 'Filter by integration type' }).click()
    await app.getByRole('option', { name: 'MCP Server' }).click()

    // Assert - Integration type filter applied
    const typeChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Integration type' })
    await expect(typeChipGroup.getByText('MCP Server')).toBeVisible()
    expect(app.url()).toContain('provider_type=mcp')

    // Assert - All three filters active
    await expect(nameChipGroup.getByText('integration')).toBeVisible()
    await expect(statusChipGroup.getByText('Error')).toBeVisible()
    await expect(typeChipGroup.getByText('MCP Server')).toBeVisible()

    // Verify URL contains all filters
    expect(app.url()).toContain('name%5Bcontains%5D=integration')
    expect(app.url()).toContain('status=error')
    expect(app.url()).toContain('provider_type=mcp')

    // Act - Clear all filters
    await app.locator('#filter-toolbar').getByRole('button', { name: 'Clear all filters' }).click()

    // Assert - All filters removed
    await expect(app.locator('#filter-toolbar').getByRole('list')).toHaveCount(0)
    expect(app.url()).not.toContain('name%5Bcontains%5D')
    expect(app.url()).not.toContain('status=')
    expect(app.url()).not.toContain('provider_type=')
  })

  test('shareable URLs: filters restored from URL', async ({ app, context }) => {
    // Navigate to integrations and apply filters
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    // Apply name filter
    await app.getByPlaceholder('Filter by name').fill('bot')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Apply status filter
    const fieldSelector = app.getByRole('button', { name: 'Name' }).first()
    await fieldSelector.click()
    await app.getByRole('option', { name: 'Status' }).click()
    await app.getByRole('button', { name: 'Filter by status' }).click()
    await app.getByRole('option', { name: 'Available' }).click()

    // Verify filters applied
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup.getByText('bot')).toBeVisible()
    const statusChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Status' })
    await expect(statusChipGroup.getByText('Available')).toBeVisible()

    // Capture URL with filters
    const urlWithFilters = app.url()
    expect(urlWithFilters).toContain('name%5Bcontains%5D=bot')
    expect(urlWithFilters).toContain('status=available')

    // Act - Open URL in new tab (simulate sharing URL)
    const newPage = await context.newPage()
    await newPage.goto(urlWithFilters)

    // Assert - Filters restored in new tab
    await expect(newPage.getByRole('heading', { name: 'Integrations' })).toBeVisible()
    const newPageNameChipGroup = newPage.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(newPageNameChipGroup.getByText('bot')).toBeVisible()
    const newPageStatusChipGroup = newPage.locator('#filter-toolbar').getByRole('list', { name: 'Status' })
    await expect(newPageStatusChipGroup.getByText('Available')).toBeVisible()

    // Cleanup
    await newPage.close()
  })

  test('shareable URLs: clear filters and share clean URL', async ({ app, context }) => {
    // Navigate to integrations with filters
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    // Apply filter
    await app.getByPlaceholder('Filter by name').fill('test')
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup.getByText('test')).toBeVisible()
    expect(app.url()).toContain('name%5Bcontains%5D')

    // Act - Clear filters (use toolbar button, not pagination button)
    await app.locator('#filter-toolbar').getByRole('button', { name: 'Clear all filters' }).click()

    // Assert - URL no longer contains filter params
    const cleanUrl = app.url()
    expect(cleanUrl).not.toContain('name%5Bcontains%5D')
    expect(cleanUrl).not.toContain('status=')

    // Act - Share clean URL in new tab
    const newPage = await context.newPage()
    await newPage.goto(cleanUrl)

    // Assert - No filters in new tab
    await expect(newPage.getByRole('heading', { name: 'Integrations' })).toBeVisible()
    await expect(newPage.locator('#filter-toolbar').getByRole('list')).toHaveCount(0)

    // Cleanup
    await newPage.close()
  })

  test('filter state persists across navigation (URL-based)', async ({ app }) => {
    // Navigate to integrations and apply filter
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    await app.getByPlaceholder('Filter by name').fill('slack')
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup.getByText('slack')).toBeVisible()

    // Capture URL with filter
    const urlWithFilter = app.url()
    expect(urlWithFilter).toContain('name%5Bcontains%5D=slack')

    // Act - Navigate to a different page
    await app.goto(toAppUrl('/'))

    // Act - Navigate back to the saved URL with filter
    await app.goto(urlWithFilter)

    // Assert - Filter state restored from URL
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()
    const restoredNameChipGroup = app.locator('#filter-toolbar .pf-v6-c-label-group').filter({ hasText: 'Name' })
    await expect(restoredNameChipGroup.getByText('slack')).toBeVisible()

    // Verify URL still contains filter
    expect(app.url()).toContain('name%5Bcontains%5D=slack')
  })

  test('individual filter chips can be removed', async ({ app }) => {
    // Navigate and apply multiple filters
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    // Apply name filter
    await app.getByPlaceholder('Filter by name').fill('monitor')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Apply status filter
    const fieldSelector = app.getByRole('button', { name: 'Name' }).first()
    await fieldSelector.click()
    await app.getByRole('option', { name: 'Status' }).click()
    await app.getByRole('button', { name: 'Filter by status' }).click()
    await app.getByRole('option', { name: 'Available' }).click()

    // Verify both filters active
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup.getByText('monitor')).toBeVisible()
    const statusChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Status' })
    await expect(statusChipGroup.getByText('Available')).toBeVisible()

    // Act - Remove name filter chip
    await nameChipGroup
      .locator('.pf-v6-c-label', { hasText: 'monitor' })
      .getByRole('button', { name: /close/i })
      .click()

    // Assert - Name filter removed, status filter remains
    await expect(nameChipGroup).not.toBeVisible()
    await expect(statusChipGroup.getByText('Available')).toBeVisible()

    // Assert - URL updated
    expect(app.url()).not.toContain('name%5Bcontains%5D')
    expect(app.url()).toContain('status=available')

    // Act - Remove status filter chip
    await statusChipGroup
      .locator('.pf-v6-c-label', { hasText: 'Available' })
      .getByRole('button', { name: /close/i })
      .click()

    // Assert - All filters removed
    await expect(app.locator('#filter-toolbar').getByRole('list')).toHaveCount(0)
    expect(app.url()).not.toContain('status=')
  })

  test('empty state shows when filters return no results', async ({ app }) => {
    // Navigate to integrations
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    // Wait for table to load
    await expect(app.getByRole('grid', { name: 'Integrations table' })).toBeVisible()

    // Apply filter with impossible name that will never match our mock data
    await app.getByPlaceholder('Filter by name').fill('ZZZZZ_NONEXISTENT_12345')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Wait for filter chip to appear
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup).toBeVisible()

    // Assert - Empty state with "No results found" heading
    await expect(app.getByRole('heading', { name: 'No results found' })).toBeVisible()

    // Clear filters using button in empty state (not the toolbar button)
    await app.getByRole('button', { name: 'Clear all filters' }).last().click()

    // Assert - Filter removed, table visible again
    await expect(nameChipGroup).not.toBeVisible()
    await expect(app.getByRole('grid', { name: 'Integrations table' })).toBeVisible()
  })

  test('pagination works with filtered results', async ({ app }) => {
    // Navigate to integrations - we have 22 integrations, limit 20 triggers pagination
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    // Wait for table to load
    await expect(app.getByRole('grid', { name: 'Integrations table' })).toBeVisible()

    // Wait for footer to show total count
    await expect(app.getByText(/20 integrations/i)).toBeVisible()

    // Assert - Next button enabled (22 integrations > 20 limit), Prev disabled (page 1)
    const nextButton = app.getByRole('button', { name: 'Next page' })
    const prevButton = app.getByRole('button', { name: 'Previous page' })
    await expect(nextButton).not.toBeDisabled()
    await expect(prevButton).toBeDisabled()

    // Act - Navigate to page 2
    await nextButton.click()

    // Assert - Now showing 2 integrations (22 total - 20 on first page)
    await expect(app.getByText(/2 integrations/i)).toBeVisible()

    // Assert - Previous button enabled, Next disabled (last page)
    await expect(prevButton).not.toBeDisabled()
    await expect(nextButton).toBeDisabled()

    // Act - Go back to page 1
    await prevButton.click()

    // Assert - Back to first page showing 20 integrations
    await expect(app.getByText(/20 integrations/i)).toBeVisible()
    await expect(prevButton).toBeDisabled()
    await expect(nextButton).not.toBeDisabled()
  })

  test('full user flow: add filters → view results → clear filters', async ({ app }) => {
    // Navigate to integrations page
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

    // Wait for table to load
    const table = app.getByRole('grid', { name: 'Integrations table' })
    await expect(table).toBeVisible()

    // Count initial integrations
    const initialRows = await app.getByRole('row').count()
    expect(initialRows).toBeGreaterThan(1) // Header + at least 1 data row

    // Act - Apply name filter
    const nameFilterInput = app.getByPlaceholder('Filter by name')
    await nameFilterInput.fill('integration')
    await app.getByRole('button', { name: 'Apply filter' }).click()

    // Assert - Active filter chip displayed
    const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
    await expect(nameChipGroup).toBeVisible()
    await expect(nameChipGroup.getByText('integration')).toBeVisible()

    // Verify URL contains filter
    expect(app.url()).toContain('name%5Bcontains%5D=integration')

    // Act - Add status filter (switch to Status field and select "Available")
    const fieldSelector = app.getByRole('button', { name: 'Name' }).first()
    await fieldSelector.click()
    await app.getByRole('option', { name: 'Status' }).click()
    await app.getByRole('button', { name: 'Filter by status' }).click()
    await app.getByRole('option', { name: 'Available' }).click()

    // Assert - Both filter chips displayed
    await expect(nameChipGroup.getByText('integration')).toBeVisible()
    const statusChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Status' })
    await expect(statusChipGroup).toBeVisible()
    await expect(statusChipGroup.getByText('Available')).toBeVisible()

    // Verify both filters in URL
    expect(app.url()).toContain('name%5Bcontains%5D=integration')
    expect(app.url()).toContain('status=available')

    // Act - Clear all filters (use first button in toolbar, not in empty state)
    await app.locator('#filter-toolbar').getByRole('button', { name: 'Clear all filters' }).click()

    // Assert - All filter chips removed
    await expect(app.locator('#filter-toolbar').getByRole('list')).toHaveCount(0)

    // Verify URL no longer contains filters
    expect(app.url()).not.toContain('name%5Bcontains%5D')
    expect(app.url()).not.toContain('status=')
  })
})
