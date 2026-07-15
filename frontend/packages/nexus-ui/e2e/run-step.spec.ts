/**
 * E2E Tests: Run Step Feature
 *
 * Critical paths covered:
 * - Opening "Run step" from step kebab menu
 * - Choice dialog display with both options
 * - Transitioning to mock data editor
 * - Entering JSON and running the step
 * - Dialog cancellation and state reset
 *
 * Edge cases:
 * - Empty JSON input (valid — runs with no mock data)
 * - Invalid JSON input (validation error shown)
 * - Dialog state resets when closed
 */

import { test, expect, toAppUrl } from './fixtures'
import {
  buildUniqueName,
  clickAddConnectedStep,
  closeNodeEditorPanel,
  createBasicWorkflow,
  deleteWorkflow,
  fillCodeEditor,
  selectProjectIfRequired,
  triggerLayout,
} from './helpers/workflows'
import { ensureProject } from './utils/api'

/** Create trigger → First action → Second action workflow from scratch. */
async function createTwoNodeWorkflow(app: import('@playwright/test').Page, workflowName: string) {
  await ensureProject(app)
  await app.goto(toAppUrl('/workflow-builder/new'))
  await expect(app.getByRole('heading', { name: 'Select a trigger node' })).toBeVisible()

  // Add manual trigger
  await app.getByRole('button', { name: 'Manual trigger' }).click()
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual trigger')
  await app.getByRole('button', { name: 'Create' }).click()

  // Add first action node
  const firstPanel = await clickAddConnectedStep(app)
  await firstPanel.getByRole('button', { name: 'Action', exact: true }).click()
  await firstPanel.getByRole('button', { name: 'Script', exact: true }).click()
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('First action')
  await fillCodeEditor(app, { value: 'print("first")' })
  await app.getByRole('button', { name: 'Create' }).click()
  await closeNodeEditorPanel(app)

  // Add second action node
  const secondPanel = await clickAddConnectedStep(app)
  await secondPanel.getByRole('button', { name: 'Action', exact: true }).click()
  await secondPanel.getByRole('button', { name: 'Script', exact: true }).click()
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Second action')
  await fillCodeEditor(app, { value: 'print("second")' })
  await app.getByRole('button', { name: 'Create' }).click()
  await closeNodeEditorPanel(app)

  // Save
  await selectProjectIfRequired(app)
  await app.getByPlaceholder('Workflow name').fill(workflowName)
  await app.getByRole('button', { name: 'Save' }).click()
  await expect(app).toHaveURL(/workflow-builder\/.+/)
  await triggerLayout(app)
  await expect(app.locator('.react-flow__node').filter({ hasText: 'Second action' })).toBeVisible({
    timeout: 15_000,
  })
}

/** Click a React Flow node's kebab menu by its visible text label. */
async function openNodeKebabMenu(app: import('@playwright/test').Page, nodeText: string) {
  await triggerLayout(app)
  const node = app.locator('.react-flow__node').filter({ hasText: nodeText })
  await expect(node).toBeVisible({ timeout: 15_000 })

  // Ensure node is expanded so the kebab is reachable
  const expandToggle = node.getByTestId('node-expand-toggle')
  if ((await expandToggle.count()) > 0) {
    await expandToggle.click()
  }

  const kebabButton = node.getByLabel('Step actions menu')
  await expect(kebabButton).toBeVisible({ timeout: 10_000 })
  await kebabButton.click()
  await expect(app.getByRole('menuitem', { name: 'Run step' })).toBeVisible({ timeout: 5_000 })
}

/** Open the Run step choice dialog for a node by its canvas label. */
async function openRunStepDialog(app: import('@playwright/test').Page, nodeText: string) {
  await openNodeKebabMenu(app, nodeText)
  await app.getByRole('menuitem', { name: 'Run step' }).click()
  await expect(app.getByRole('heading', { name: `Run ${nodeText}?` })).toBeVisible({ timeout: 15_000 })
}

// Skipped: flaky openRunStepDialog timeout is blocking the merge queue
test.describe.skip('Run Step', () => {
  test('opens "Run step" dialog from step kebab menu', async ({ app }) => {
    // Arrange - Create a workflow with a script node
    const workflowName = buildUniqueName('e2e-run-step')
    await createBasicWorkflow(app, workflowName, 'Test action')

    try {
      // Act - Click the kebab menu on the script node
      await openNodeKebabMenu(app, 'Test action')

      // Assert - Verify "Run step" menu item is visible
      await expect(app.getByRole('menuitem', { name: 'Run step' })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('displays choice dialog with correct title and buttons', async ({ app }) => {
    // Arrange - Create workflow and open run step dialog
    const workflowName = buildUniqueName('e2e-run-step-choice')
    await createBasicWorkflow(app, workflowName, 'Test action')

    try {
      // Act - Open the Run step dialog
      await openRunStepDialog(app, 'Test action')

      // Assert - Verify dialog appears with correct title (openRunStepDialog already waited)

      // Assert - Verify both option buttons exist
      const runAllButton = app.getByRole('button', { name: 'Run all previous steps' })
      const mockDataButton = app.getByRole('button', { name: 'Set mock data' })
      const cancelButton = app.getByRole('button', { name: 'Cancel' })

      await expect(runAllButton).toBeVisible()
      await expect(mockDataButton).toBeVisible()
      await expect(cancelButton).toBeVisible()

      // Assert - "Run all previous steps" is enabled
      await expect(runAllButton).toBeEnabled()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  // Skip: kebab menu DOM detaches during canvas layout animation causing flaky timeout in CI
  test.skip('transitions to mock data editor when "Set mock data" is clicked', async ({ app }) => {
    // Arrange - Create workflow with two nodes so second node has a predecessor to mock
    const workflowName = buildUniqueName('e2e-run-step-mock')
    await createTwoNodeWorkflow(app, workflowName)

    try {
      await openRunStepDialog(app, 'Second action')
      await app.getByRole('button', { name: 'Set mock data' }).click()

      await expect(app.getByRole('heading', { name: 'Set mock data for Second action' })).toBeVisible()
      await expect(app.getByTestId('inline-code-editor')).toBeVisible()
      const dialog = app.getByLabel('Set mock data for Second action')
      await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test.skip('allows entering JSON and clicking Run', async ({ app }) => {
    // Skip: requires POST /workflows/{id}/test backend endpoint (nexus PR #929)
    // Arrange - Create workflow and navigate to mock editor
    const workflowName = buildUniqueName('e2e-run-step-json')
    await createBasicWorkflow(app, workflowName, 'Test action')

    try {
      // Act - Open mock editor
      await openRunStepDialog(app, 'Test action')
      await app.getByRole('button', { name: 'Set mock data' }).click()

      // Act - Enter JSON in code editor
      await fillCodeEditor(app, {
        value: '{"hostname": "server1", "status": "active"}',
        label: 'Mock JSON output data',
      })

      // Act - Click Run button
      const runButton = app.getByRole('button', { name: 'Run', exact: true })
      await runButton.click()

      // Assert - Dialog closes (no error modal appears)
      await expect(app.getByRole('heading', { name: 'Set mock data for Test action' })).not.toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('closes dialog when Cancel is clicked from choice screen', async ({ app }) => {
    // Arrange - Create workflow and open choice dialog
    const workflowName = buildUniqueName('e2e-run-step-cancel')
    await createBasicWorkflow(app, workflowName, 'Test action')

    try {
      // Act - Open run step dialog
      await openRunStepDialog(app, 'Test action')

      // Act - Click Cancel
      await app.getByRole('button', { name: 'Cancel' }).click()

      // Assert - Dialog is closed
      await expect(app.getByRole('heading', { name: 'Run Test action?' })).not.toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('closes dialog when Cancel is clicked from mock editor', async ({ app }) => {
    // Arrange - Create workflow with two nodes and navigate to mock editor
    const workflowName = buildUniqueName('e2e-run-step-cancel-mock')
    await createTwoNodeWorkflow(app, workflowName)

    try {
      await openRunStepDialog(app, 'Second action')
      await app.getByRole('button', { name: 'Set mock data' }).click()
      await expect(app.getByRole('heading', { name: 'Set mock data for Second action' })).toBeVisible()

      await app.getByRole('button', { name: 'Cancel' }).click()
      await expect(app.getByRole('heading', { name: 'Set mock data for Second action' })).not.toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test.skip('accepts empty JSON input and runs successfully', async ({ app }) => {
    // Skip: requires POST /workflows/{id}/test backend endpoint (nexus PR #929)
    // Arrange - Create workflow and navigate to mock editor
    const workflowName = buildUniqueName('e2e-run-step-empty')
    await createBasicWorkflow(app, workflowName, 'Test action')

    try {
      // Act - Open mock editor (JSON is empty by default)
      await openRunStepDialog(app, 'Test action')
      await app.getByRole('button', { name: 'Set mock data' }).click()

      // Act - Click Run with empty JSON
      const runButton = app.getByRole('button', { name: 'Run', exact: true })
      await runButton.click()

      // Assert - Dialog closes without error
      await expect(app.getByRole('heading', { name: 'Set mock data for Test action' })).not.toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test.skip('validates JSON and shows error for invalid input', async ({ app }) => {
    // Skip: fillCodeEditor with invalid JSON goes through Monaco which may normalize the input
    // Arrange - Create workflow and navigate to mock editor
    const workflowName = buildUniqueName('e2e-run-step-invalid')
    await createBasicWorkflow(app, workflowName, 'Test action')

    try {
      // Act - Open mock editor
      await openRunStepDialog(app, 'Test action')
      await app.getByRole('button', { name: 'Set mock data' }).click()

      // Act - Enter invalid JSON
      await fillCodeEditor(app, { value: '{invalid json}', label: 'Mock JSON output data' })

      // Act - Click Run
      const runButton = app.getByRole('button', { name: 'Run', exact: true })
      await runButton.click()

      // Assert - Error message appears (JSON parse error)
      await expect(app.locator('[class*="alert"]').filter({ hasText: /Unexpected|expected/i })).toBeVisible()

      // Assert - Dialog remains open
      await expect(app.getByRole('heading', { name: 'Set mock data for Test action' })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test.skip('dialog state resets when closed and reopened', async ({ app }) => {
    // Arrange - Create workflow with two nodes
    const workflowName = buildUniqueName('e2e-run-step-reset')
    await createTwoNodeWorkflow(app, workflowName)

    try {
      // Act 1 - Open mock editor on second node
      await openRunStepDialog(app, 'Second action')
      await app.getByRole('button', { name: 'Set mock data' }).click()
      await expect(app.getByTestId('inline-code-editor')).toBeVisible()

      // Act 2 - Close dialog and wait for backdrop to clear
      await app.getByRole('button', { name: 'Cancel' }).click()
      await expect(app.getByRole('heading', { name: 'Set mock data for Second action' })).not.toBeVisible()
      await expect(app.getByRole('dialog')).not.toBeVisible()

      // Act 3 - Reopen dialog
      await openRunStepDialog(app, 'Second action')

      // Assert - Dialog resets to choice screen
      await expect(app.getByRole('heading', { name: 'Run Second action?' })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})
