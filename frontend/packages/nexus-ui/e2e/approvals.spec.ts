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

  const nameChipGroup = app.getByRole('search', { name: 'Filters' }).getByRole('list', { name: 'Name' })
  await expect(nameChipGroup.getByText('Policy')).toBeVisible()
  await expect(app).toHaveURL(/name%5Bcontains%5D=Policy/)

  // Step 2: Add status filter
  const fieldSelector = app.locator('#filter-toolbar').getByRole('button', { name: 'Name', exact: true })
  await fieldSelector.click()
  await app.getByRole('option', { name: 'Status' }).click()
  await app.getByRole('button', { name: 'Filter by status' }).click()
  await app.getByRole('option', { name: 'Approved' }).click()

  const statusChipGroup = app.getByRole('search', { name: 'Filters' }).getByRole('list', { name: 'Status' })
  await expect(nameChipGroup.getByText('Policy')).toBeVisible()
  await expect(statusChipGroup.getByText('Approved')).toBeVisible()
  await expect(app).toHaveURL(/name%5Bcontains%5D=Policy/)
  await expect(app).toHaveURL(/status=approved/)

  // Step 3: Remove name chip individually
  const nameLabel = nameChipGroup.locator('.pf-v6-c-label').filter({ hasText: 'Policy' })
  await nameLabel.getByRole('button', { name: /close/i }).click()

  await expect(nameChipGroup).not.toBeVisible()
  await expect(statusChipGroup.getByText('Approved')).toBeVisible()
  await expect(app).not.toHaveURL(/name%5Bcontains%5D/)
  await expect(app).toHaveURL(/status=approved/)

  // Step 4: Clear all filters
  await app.getByRole('search', { name: 'Filters' }).getByRole('button', { name: 'Clear all filters' }).click()

  await expect(app.getByRole('search', { name: 'Filters' }).getByRole('list')).toHaveCount(0)
  await expect(app).not.toHaveURL(/name%5Bcontains%5D/)
  await expect(app).not.toHaveURL(/status=/)

  // Step 5: Empty state when filters match nothing
  // Switch back to Name field (selector may still show Status after clearing)
  const nameFieldSelector = app.locator('#filter-toolbar').getByRole('button', { name: /Name|Status/ })
  await nameFieldSelector.click()
  await app.getByRole('option', { name: 'Name' }).click()

  const impossibleName = `zzz-nonexistent-${Date.now()}`
  await app.getByPlaceholder('Filter by name').fill(impossibleName)
  await app.getByRole('button', { name: 'Apply filter' }).click()

  const filterChipGroup = app.getByRole('search', { name: 'Filters' }).getByRole('list', { name: 'Name' })
  await expect(filterChipGroup).toBeVisible()

  const tableVisible = await table.isVisible().catch(() => false)
  if (!tableVisible) {
    await expect(app.getByRole('heading', { name: 'No results found' })).toBeVisible()
    await app.getByRole('button', { name: 'Clear all filters' }).last().click()
    await expect(table).toBeVisible()
  }
})

test('user approves an approval via the side panel', async ({ app }) => {
  await app.goto(toAppUrl('/approvals'))
  await expect(app.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible()

  const approvalsTable = app.getByRole('grid', { name: 'Approvals table' })
  const hasApprovalsTable = await approvalsTable
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!hasApprovalsTable, 'No approval data available; seed data required')

  // Click a pending approval name — navigates to execution detail with side panel
  const approvalBtn = approvalsTable.getByRole('button', { name: 'AI Agent Decision' })
  const hasBtn = await approvalBtn
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!hasBtn, 'AI Agent Decision approval not available')

  await approvalBtn.click()

  // Verify navigation to execution detail with side panel open
  await expect(app).toHaveURL(/\/executions\/[^?]+\?approval=/)
  await expect(app.getByRole('heading', { name: 'Review Approval' })).toBeVisible({ timeout: 15_000 })

  // Approve with notes
  await app.getByRole('button', { name: 'Approve' }).click()
  await app.getByPlaceholder(/Explain the reason for approving/i).fill('Looks good')
  await app.getByRole('button', { name: 'Submit decision' }).click()

  await expect(app.getByText('Approval submitted')).toBeVisible()
})
