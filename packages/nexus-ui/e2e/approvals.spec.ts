import { test, expect, toAppUrl } from './fixtures'

test('user filters approvals by name and status', async ({ app }) => {
  // Navigate to approvals page
  await app.goto(toAppUrl('/approvals'))
  await expect(app.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible()

  // Wait for table to load (skip if no approval data exists)
  const table = app.getByRole('grid', { name: 'Approvals table' })
  const hasTable = await table
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!hasTable, 'No approval data available; seed data required')

  // Step 1: Apply name filter
  await app.getByPlaceholder('Filter by name').fill('Policy')
  await app.getByRole('button', { name: 'Apply filter' }).click()

  const nameChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'Name' })
  await expect(nameChipGroup.getByText('Policy')).toBeVisible()
  expect(app.url()).toContain('name%5Bcontains%5D=Policy')

  // Step 2: Add status filter
  const fieldSelector = app.getByRole('button', { name: 'Name' }).first()
  await fieldSelector.click()
  await app.getByRole('option', { name: 'Status' }).click()
  await app.getByRole('button', { name: 'Filter by status' }).click()
  await app.getByRole('option', { name: 'Approved' }).click()

  const statusChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'Status' })
  await expect(nameChipGroup.getByText('Policy')).toBeVisible()
  await expect(statusChipGroup.getByText('Approved')).toBeVisible()
  expect(app.url()).toContain('name%5Bcontains%5D=Policy')
  expect(app.url()).toContain('status=approved')

  // Step 3: Remove name chip individually
  const nameLabel = nameChipGroup.locator('.pf-v6-c-label').filter({ hasText: 'Policy' })
  await nameLabel.getByRole('button', { name: /close/i }).click()

  await expect(nameChipGroup).not.toBeVisible()
  await expect(statusChipGroup.getByText('Approved')).toBeVisible()
  expect(app.url()).not.toContain('name%5Bcontains%5D')
  expect(app.url()).toContain('status=approved')

  // Step 4: Clear all filters
  await app.locator('#filter-toolbar').getByRole('button', { name: 'Clear all filters' }).click()

  await expect(app.locator('.pf-v6-c-label-group')).toHaveCount(0)
  expect(app.url()).not.toContain('name%5Bcontains%5D')
  expect(app.url()).not.toContain('status=')

  // Step 5: Empty state when filters match nothing
  // Switch back to Name field (selector may still show Status after clearing)
  const nameFieldSelector = app.getByRole('button', { name: /Name|Status/ }).first()
  await nameFieldSelector.click()
  await app.getByRole('option', { name: 'Name' }).click()

  const impossibleName = `zzz-nonexistent-${Date.now()}`
  await app.getByPlaceholder('Filter by name').fill(impossibleName)
  await app.getByRole('button', { name: 'Apply filter' }).click()

  const filterChipGroup = app.locator('.pf-v6-c-label-group').filter({ hasText: 'Name' })
  await expect(filterChipGroup).toBeVisible()

  const tableVisible = await table.isVisible().catch(() => false)
  if (!tableVisible) {
    await expect(app.getByRole('heading', { name: 'No results found' })).toBeVisible()
    await app.getByRole('button', { name: 'Clear all filters' }).last().click()
    await expect(table).toBeVisible()
  }
})

test('user approves an approval request and sees status update', async ({ app }) => {
  // Arrange - Open approvals list
  await app.goto(toAppUrl('/approvals'))
  await expect(app.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible()

  // Act - Wait for table and open a pending approval (skip if no data)
  const approvalsTable = app.getByRole('grid', { name: 'Approvals table' })
  const hasApprovalsTable = await approvalsTable
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!hasApprovalsTable, 'No approval data available; seed data required')
  await app.getByRole('button', { name: 'AI Agent Decision' }).first().click()

  // Act - Approve with notes
  await app.getByRole('button', { name: 'Approve' }).click()
  await app.getByPlaceholder(/Explain the reason for approving/i).fill('Looks good')
  await app.getByRole('button', { name: 'Submit' }).click()

  // Assert - Submit alert appears
  await expect(app.getByText('Approval submitted')).toBeVisible()
  await expect(app.getByText("Unfortunately, this isn't yet implemented.")).toBeVisible()
})
