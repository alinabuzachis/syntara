/**
 * E2E Tests: Conditional Node Configuration [UI-14]
 *
 * Critical paths covered:
 * - Adding a Conditional node to the workflow canvas
 * - Configuring if/else-if/else branching conditions
 * - Saving and verifying configuration persistence
 * - Reopening saved nodes to verify data persists
 *
 * Edge cases:
 * - Default else branch exists without explicit configuration
 * - Multiple else-if branches can be added
 * - Custom comparison operators (e.g., "is greater than")
 * - Condition groups for complex AND/OR logic
 */

import { test, expect } from '../fixtures'
import { addConditionalNode } from '../helpers/v2-nodes'
import {
  buildUniqueName,
  clickAddConnectedStep,
  closeNodeEditorPanel,
  deleteWorkflow,
  saveWorkflow,
  startWorkflowWithTrigger,
  verifyNodeVisible,
  waitForUIReady,
} from '../helpers/workflows'

test('user adds Conditional node and saves workflow', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-conditional')

  try {
    // Arrange - Create a workflow with manual trigger
    await startWorkflowWithTrigger(app)

    // Act - Add Conditional node
    await addConditionalNode(app, 'Check status', {
      field: 'status',
      value: 'success',
    })

    // Assert - Verify the Conditional node appears on canvas
    await verifyNodeVisible(app, 'Check status')

    // Save the workflow
    await saveWorkflow(app, workflowName)

    // Assert - Verify workflow is persisted
    await expect(app).toHaveURL(/workflow-builder\/.+/)
    await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName)

    // Verify the node is still visible after save
    await verifyNodeVisible(app, 'Check status')
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('user reopens Conditional node to verify configuration persists', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-conditional-edit')

  try {
    // Arrange - Create a workflow with a Conditional node
    await startWorkflowWithTrigger(app)

    // Add Conditional node with custom operator
    await addConditionalNode(app, 'Initial condition', {
      field: 'value',
      operator: 'is greater than',
      value: '100',
    })

    // Save workflow
    await saveWorkflow(app, workflowName)

    // Act - Reopen the Conditional node to verify configuration persists
    await verifyNodeVisible(app, 'Initial condition')
    const conditionalNode = app
      .locator('[role="group"][aria-roledescription="node"]')
      .filter({ hasText: 'Initial condition' })

    // Wait for UI to be fully ready before interacting
    await waitForUIReady(app)

    // Double-click on the node to open its configuration
    const nameInput = app.getByRole('textbox', { name: 'Name', exact: true })
    await expect(async () => {
      await conditionalNode.dblclick({ force: true })
      await expect(nameInput).toBeVisible()
    }).toPass({ timeout: 15_000, intervals: [1_000, 2_000, 3_000] })

    // Assert - Verify all configuration fields persisted
    await expect(app.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Initial condition')
    await expect(app.getByRole('textbox', { name: 'Field', exact: true })).toHaveValue('value')
    await expect(app.getByLabel('Comparison operator')).toHaveText('is greater than')
    await expect(app.getByRole('textbox', { name: 'Value', exact: true })).toHaveValue('100')

    await closeNodeEditorPanel(app)

    // Verify the node is still on the canvas after reopening and closing
    await expect(conditionalNode).toBeVisible()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('user configures Conditional node with if/else-if/else branches', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-conditional-else-if')

  try {
    // Arrange - Create a workflow with manual trigger
    await startWorkflowWithTrigger(app)

    // Act - Add Conditional node with initial condition
    // Note: We partially use the helper then manually add else-if branch
    const panel = await clickAddConnectedStep(app)
    await panel.getByRole('button', { name: 'Logic', exact: true }).click()
    await expect(panel.getByRole('heading', { name: /select a logic step/i })).toBeVisible({ timeout: 10000 })
    await panel.getByRole('button', { name: 'Conditional', exact: true }).click()

    // Wait for the form to load
    await expect(app.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible({ timeout: 10000 })

    // Configure node name
    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Multi-branch conditional')

    // Configure the IF condition with an expression
    const fieldInput = app.getByRole('textbox', { name: 'Field', exact: true })
    await expect(fieldInput).toBeVisible({ timeout: 10000 })
    await fieldInput.fill('status')

    const valueInput = app.getByRole('textbox', { name: 'Value', exact: true })
    await expect(valueInput).toBeVisible({ timeout: 10000 })
    await valueInput.fill('success')

    await waitForUIReady(app)

    // Add an else-if branch by clicking "Add condition" button
    const addConditionButton = app.getByRole('button', { name: 'Add condition', exact: true })
    await expect(addConditionButton).toBeVisible({ timeout: 10000 })
    await addConditionButton.click()

    await waitForUIReady(app)

    // Configure the else-if condition (second field/value inputs)
    const allFieldInputs = app.getByRole('textbox', { name: 'Field', exact: true })
    await expect(allFieldInputs).toHaveCount(2)
    await allFieldInputs.nth(1).fill('status')

    const allValueInputs = app.getByRole('textbox', { name: 'Value', exact: true })
    await expect(allValueInputs).toHaveCount(2)
    await allValueInputs.nth(1).fill('pending')

    await waitForUIReady(app)

    // Verify the form still shows "Add condition" button (can add more branches)
    await expect(addConditionButton).toBeVisible()

    // Save the configuration
    const saveButton = app.getByRole('button', { name: 'Create' })
    await expect(saveButton).toBeEnabled({ timeout: 10000 })
    await saveButton.click()

    // Wait for the form to close
    await expect(app.getByRole('button', { name: 'Create' })).not.toBeAttached({ timeout: 15000 })
    await waitForUIReady(app)

    // Assert - Verify the Conditional node appears on canvas
    await verifyNodeVisible(app, 'Multi-branch conditional')
    const conditionalNode = app
      .locator('[role="group"][aria-roledescription="node"]')
      .filter({ hasText: 'Multi-branch conditional' })

    // Save the workflow
    await saveWorkflow(app, workflowName)

    // Verify workflow is persisted
    await expect(app).toHaveURL(/workflow-builder\/.+/)
    // Verify output handles on the canvas (at least 2 for if/else-if)
    const outputHandles = conditionalNode.locator('[data-handlepos="right"]')
    await expect(outputHandles).not.toHaveCount(0, { timeout: 10_000 })
    await expect(outputHandles).not.toHaveCount(1, { timeout: 10_000 })
    await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName)

    // Reopen the node to verify branches persisted
    await waitForUIReady(app)
    const nameInputReopened = app.getByRole('textbox', { name: 'Name', exact: true })
    await expect(async () => {
      await conditionalNode.dblclick({ force: true })
      await expect(nameInputReopened).toBeVisible()
    }).toPass({ timeout: 15_000, intervals: [1_000, 2_000, 3_000] })

    // Verify both conditions (if + else-if) are still present
    const reopenedFieldInputs = app.getByRole('textbox', { name: 'Field', exact: true })
    await expect(reopenedFieldInputs).toHaveCount(2)

    await closeNodeEditorPanel(app)
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('user adds condition group to create complex conditional logic', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-conditional-group')

  try {
    // Arrange - Create a workflow with manual trigger
    await startWorkflowWithTrigger(app)

    // Act - Add Conditional node with initial condition
    // Note: We partially use the helper then manually add group
    const panel = await clickAddConnectedStep(app)
    await panel.getByRole('button', { name: 'Logic', exact: true }).click()
    await expect(panel.getByRole('heading', { name: /select a logic step/i })).toBeVisible({ timeout: 10000 })
    await panel.getByRole('button', { name: 'Conditional', exact: true }).click()

    // Wait for the form to load
    await expect(app.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible({ timeout: 10000 })

    // Configure node name
    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Complex conditional')

    // Configure the first condition
    const fieldInput = app.getByRole('textbox', { name: 'Field', exact: true })
    await expect(fieldInput).toBeVisible({ timeout: 10000 })
    await fieldInput.fill('status')

    const valueInput = app.getByRole('textbox', { name: 'Value', exact: true })
    await expect(valueInput).toBeVisible({ timeout: 10000 })
    await valueInput.fill('active')

    await waitForUIReady(app)

    // Click "Add group" button to add a condition group
    const addGroupButton = app.getByRole('button', { name: 'Add group', exact: true })
    await expect(addGroupButton).toBeVisible({ timeout: 10000 })

    // Capture field count before adding group
    const fieldInputs = app.getByRole('textbox', { name: 'Field', exact: true })
    const countBefore = await fieldInputs.count()

    await addGroupButton.click()
    await waitForUIReady(app)

    // Verify that a new group section was added by checking for increased field count
    await expect(fieldInputs).not.toHaveCount(countBefore, { timeout: 10000 })

    // Save the configuration
    const saveButton = app.getByRole('button', { name: 'Create' })
    await expect(saveButton).toBeEnabled({ timeout: 10000 })
    await saveButton.click()

    // Wait for the form to close
    await expect(app.getByRole('button', { name: 'Create' })).not.toBeAttached({ timeout: 15000 })
    await waitForUIReady(app)

    // Assert - Verify the Conditional node appears on canvas
    await verifyNodeVisible(app, 'Complex conditional')

    // Save the workflow
    await saveWorkflow(app, workflowName)

    // Verify workflow is persisted
    await expect(app).toHaveURL(/workflow-builder\/.+/)
    await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName)
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})
