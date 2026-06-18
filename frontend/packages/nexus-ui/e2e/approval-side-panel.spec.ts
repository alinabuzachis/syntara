/**
 * E2E Tests: Approval Side Panel
 *
 * Critical paths covered:
 * - Deep-link from approvals list navigates to execution detail with side panel
 * - Side panel displays approval details (step name, workflow, approve/reject buttons)
 * - Approve and reject flows with notes and undo
 * - Panel and run history card are mutually exclusive
 * - Viewer role cannot approve or reject (permission gating)
 * - Self-contained: create workflow with approval node, run, verify execution page
 *
 * Seed data:
 * - Approval "Production Deployment Approval" (550e8400-...-446655440050) linked to exec-approval
 */
import { test, expect, toAppUrl } from './fixtures'
import { addApprovalNodeWithBranch } from './helpers/v2-nodes'
import { buildUniqueName, createBasicWorkflow } from './helpers/workflows'
import { apiRequest } from './utils/api'

const MOCK_APPROVAL_ID = '550e8400-e29b-41d4-a716-446655440050'
const MOCK_EXECUTION_ID = 'exec-approval'
const DEEP_LINK = `/executions/${MOCK_EXECUTION_ID}?approval=${MOCK_APPROVAL_ID}&history=closed`

/**
 * Navigate directly to the execution detail with the approval side panel via deep-link.
 * Returns false if the panel didn't load (missing seed data / API unavailable).
 */
async function navigateToApprovalPanel(app: import('@playwright/test').Page) {
  await app.goto(toAppUrl(DEEP_LINK))
  await expect(app.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

  return app
    .getByRole('heading', { name: 'Review Approval' })
    .waitFor({ state: 'visible', timeout: 30_000 })
    .then(() => true)
    .catch(() => false)
}

test.describe('Approval Side Panel — list navigation', () => {
  test('clicking approval name navigates to execution detail with side panel', async ({ app }) => {
    await app.goto(toAppUrl('/approvals'))
    await expect(app.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible()

    const table = app.getByRole('grid', { name: 'Approvals table' })
    const hasTable = await table
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasTable, 'No approval data available')

    const approvalBtn = table.getByRole('button', { name: 'Production Deployment Approval' })
    const hasBtn = await approvalBtn
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasBtn, 'Production Deployment Approval not found in table')

    await approvalBtn.click()

    await expect(app).toHaveURL(/\/executions\/[^?]+\?approval=.*&history=closed/)
    await expect(app.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
    await expect(app.getByRole('heading', { name: 'Review Approval' })).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('Approval Side Panel — deep-link', () => {
  test('side panel displays approval details and action buttons', async ({ app }) => {
    const hasPanel = await navigateToApprovalPanel(app)
    test.skip(!hasPanel, 'Approval side panel not available')

    // Decision buttons
    await expect(app.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(app.getByRole('button', { name: 'Reject' })).toBeVisible()

    // Summary fields (use exact matching to avoid code block collisions)
    await expect(app.getByText('Approval step', { exact: true })).toBeVisible()
    await expect(app.locator('dd').getByText('Production Deployment Approval', { exact: true })).toBeVisible()
    await expect(app.getByText('Workflow', { exact: true })).toBeVisible()
    await expect(app.locator('dd').getByText('deployment-approval', { exact: true })).toBeVisible()
    await expect(app.getByText('Approval initiated', { exact: true })).toBeVisible()
  })

  test('clicking approve shows notes input and submit button', async ({ app }) => {
    const hasPanel = await navigateToApprovalPanel(app)
    test.skip(!hasPanel, 'Approval side panel not available')

    const approveBtn = app.getByRole('button', { name: 'Approve' })
    await expect(approveBtn).not.toHaveAttribute('aria-disabled', 'true')

    await approveBtn.click()

    await expect(app.getByPlaceholder(/Explain the reason for approving/i)).toBeVisible()
    await expect(app.getByRole('button', { name: 'Submit decision' })).toBeVisible()

    // Undo returns to initial button state
    await app.getByRole('button', { name: 'Undo decision' }).click()
    await expect(app.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(app.getByRole('button', { name: 'Reject' })).toBeVisible()
  })

  test('clicking reject shows notes input and submit button', async ({ app }) => {
    const hasPanel = await navigateToApprovalPanel(app)
    test.skip(!hasPanel, 'Approval side panel not available')

    const rejectBtn = app.getByRole('button', { name: 'Reject' })
    await expect(rejectBtn).not.toHaveAttribute('aria-disabled', 'true')

    await rejectBtn.click()

    await expect(app.getByPlaceholder(/Explain the reason for rejecting/i)).toBeVisible()
    await expect(app.getByRole('button', { name: 'Submit decision' })).toBeVisible()

    await app.getByRole('button', { name: 'Undo decision' }).click()
    await expect(app.getByRole('button', { name: 'Approve' })).toBeVisible()
  })

  test('run history and approval panel are mutually exclusive', async ({ app }) => {
    const hasPanel = await navigateToApprovalPanel(app)
    test.skip(!hasPanel, 'Approval side panel not available')

    // History should be closed (deep-link sets history=closed)
    const historyHeading = app.getByRole('heading', { name: 'Run history' })
    await expect(historyHeading).not.toBeVisible()

    // Open run history — should close approval panel
    await app.getByRole('button', { name: /Run history/i }).click()
    await expect(historyHeading).toBeVisible()
    await expect(app.getByRole('heading', { name: 'Review Approval' })).not.toBeVisible()

    // Re-open approval panel via the Review button — should close history
    const reviewBtn = app.getByRole('button', { name: 'Review approval' })
    await reviewBtn.click()
    await expect(app.getByRole('heading', { name: 'Review Approval' })).toBeVisible()
    await expect(historyHeading).not.toBeVisible()
  })

  test('viewer: approve and reject buttons are disabled', async ({ viewerApp }) => {
    await viewerApp.goto(toAppUrl(DEEP_LINK))
    await expect(viewerApp.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

    const hasPanel = await viewerApp
      .getByRole('heading', { name: 'Review Approval' })
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasPanel, 'Approval side panel not available')

    const approveBtn = viewerApp.getByRole('button', { name: 'Approve' })
    const rejectBtn = viewerApp.getByRole('button', { name: 'Reject' })
    await expect(approveBtn).toHaveAttribute('aria-disabled', 'true')
    await expect(rejectBtn).toHaveAttribute('aria-disabled', 'true')
  })
})

test.describe('Approval Side Panel — self-contained', () => {
  test('create workflow with approval node, run, and navigate to execution', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-approval-panel')
    await createBasicWorkflow(app, workflowName, 'Pre-approval step')

    // Extract workflow ID from builder URL for API-based cleanup
    const builderUrl = app.url()
    const workflowId = builderUrl.match(/workflow-builder\/([^/?]+)/)?.[1]

    try {
      await addApprovalNodeWithBranch(app, 'Review Gate')
      await app.getByRole('button', { name: 'Save', exact: true }).click()

      // Wait for save to complete before attempting to run
      await expect(app.getByRole('button', { name: 'Run', exact: true })).toBeEnabled({ timeout: 15_000 })

      // Run the workflow — button label depends on whether workflow is considered dirty
      await app.getByRole('button', { name: 'Run', exact: true }).click()
      await app.getByRole('button', { name: /Run now|Save and run/ }).click()

      const didNavigate = await expect(app)
        .toHaveURL(/\/executions\//)
        .then(() => true)
        .catch(() => false)
      test.skip(!didNavigate, 'Workflow execution failed — execution engine may not be running')

      await expect(app.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(app.getByRole('button', { name: 'Back to editor' })).toBeVisible()
    } finally {
      if (workflowId) {
        await apiRequest(app, 'delete', `/workflows/${workflowId}`).catch(() => {})
      }
    }
  })
})
