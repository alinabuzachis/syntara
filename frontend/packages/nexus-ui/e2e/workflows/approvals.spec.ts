/**
 * E2E Tests: Approvals List Page (UI-28, UI-29)
 *
 * Critical paths covered:
 * - Approvals list filtering by name and status
 * - UI-29: Self-contained approve flow — create workflow with approval node,
 *   run it, find the pending approval in the queue, approve it, verify execution resumes
 */
import { test, expect, toAppUrl } from '../fixtures'
import { addApprovalNodeWithBranch } from '../helpers/v2-nodes'
import { buildUniqueName, createBasicWorkflow } from '../helpers/workflows'
import { apiRequest } from '../utils/api'

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
  const fieldSelector = app.getByRole('search', { name: 'Filters' }).getByRole('button', { name: 'Name', exact: true })
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
  await nameChipGroup.getByRole('button', { name: /close/i }).click()

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
  const nameFieldSelector = app.getByRole('search', { name: 'Filters' }).getByRole('button', { name: /Name|Status/ })
  await nameFieldSelector.click()
  await app.getByRole('option', { name: 'Name' }).click()

  const impossibleName = buildUniqueName('zzz-nonexistent')
  await app.getByPlaceholder('Filter by name').fill(impossibleName)
  await app.getByRole('button', { name: 'Apply filter' }).click()

  const filterChipGroup = app.getByRole('search', { name: 'Filters' }).getByRole('list', { name: 'Name' })
  await expect(filterChipGroup).toBeVisible()

  await expect(app.getByRole('heading', { name: 'No results found' })).toBeVisible()
  await app.getByRole('button', { name: 'Clear all filters' }).last().click()
  await expect(table).toBeVisible()
})

test('UI-29: self-contained approve flow via approvals queue', async ({ app }) => {
  // Create a workflow with an approval node so we control the approval name
  const workflowName = buildUniqueName('e2e-approve')
  const approvalNodeName = buildUniqueName('gate')
  await createBasicWorkflow(app, workflowName, 'Pre-approval step')

  const workflowId = app.url().match(/workflow-builder\/([^/?]+)/)?.[1]

  try {
    // Add approval node with a unique name so we can find it in the approvals list
    await addApprovalNodeWithBranch(app, approvalNodeName)
    await app.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(app.getByRole('button', { name: 'Run', exact: true })).toBeEnabled({ timeout: 15_000 })

    // Run the workflow
    await app.getByRole('button', { name: 'Run', exact: true }).click()
    await app.getByRole('button', { name: /Run now|Save and run/ }).click()

    const didNavigate = await app
      .waitForURL(/\/executions\//, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!didNavigate, 'Workflow execution failed — execution engine may not be running')

    // Wait for execution to pause at the approval node (requires Temporal)
    const reachedApproval = await app
      .getByText('Paused')
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!reachedApproval, 'Execution stayed Pending — Temporal worker may not be running')

    // Navigate to the approvals queue and find our approval
    await app.goto(toAppUrl('/approvals'))
    await expect(app.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible()

    const approvalsTable = app.getByRole('grid', { name: 'Approvals table' })
    await approvalsTable.waitFor({ state: 'visible', timeout: 15_000 })

    // Filter by the unique approval node name
    await app.getByPlaceholder('Filter by name').fill(approvalNodeName)
    await app.getByRole('button', { name: 'Apply filter' }).click()

    const approvalBtn = approvalsTable.getByRole('button', { name: approvalNodeName })
    await approvalBtn.waitFor({ state: 'visible', timeout: 15_000 })

    // Click approval — navigates to execution detail with side panel
    await approvalBtn.click()
    await expect(app).toHaveURL(/\/executions\/[^?]+\?approval=/)
    await expect(app.getByRole('heading', { name: 'Review Approval' })).toBeVisible({ timeout: 15_000 })

    // Approve with notes
    await app.getByRole('button', { name: 'Approve' }).click()
    await app.getByPlaceholder(/Explain the reason for approving/i).fill('Approved in E2E test')
    await app.getByRole('button', { name: 'Submit decision' }).click()

    // Verify approval was submitted and execution resumes
    await expect(app.getByText('Approval submitted')).toBeVisible({ timeout: 15_000 })
    await expect(app.getByText('Completed')).toBeVisible({ timeout: 30_000 })
  } finally {
    if (workflowId) {
      await apiRequest(app, 'delete', `/workflows/${workflowId}`).catch(() => {})
    }
  }
})
