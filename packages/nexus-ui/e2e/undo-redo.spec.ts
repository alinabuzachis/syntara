/**
 * E2E Tests: Undo/Redo in the Workflow Builder
 *
 * Critical paths covered:
 * - Undo/redo add-node via toolbar buttons
 * - Undo/redo add-node via keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z)
 * - Undo/redo buttons disabled on fresh workflow load
 * - History resets when navigating away from the builder
 * - Undo/redo becomes disabled when entering execution view
 *
 * Not covered (unit tests handle these):
 * - Position undo/redo (drag detection unreliable in headless Playwright)
 * - Temporal batching internals
 * - Edge synchronization details
 */

import type { Page } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'
import { addScriptNode } from './helpers/v2-nodes'
import { buildUniqueName, createBasicWorkflow, deleteWorkflow, openWorkflowInBuilder } from './helpers/workflows'

/** Locate the undo/redo toolbar rendered by UndoRedoControls. */
const undoRedoToolbar = (app: Page) => app.getByRole('toolbar', { name: 'Undo and redo' })

/** Locate the Undo button inside the toolbar. */
const undoButton = (app: Page) => undoRedoToolbar(app).getByRole('button', { name: 'Undo' })

/** Locate the Redo button inside the toolbar. */
const redoButton = (app: Page) => undoRedoToolbar(app).getByRole('button', { name: 'Redo' })

test('undo/redo add node via toolbar buttons', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-undo-toolbar')
  await createBasicWorkflow(app, workflowName, 'Initial action')

  const nodeName = 'Toolbar undo node'

  try {
    await addScriptNode(app, nodeName)
    await expect(app.getByText(nodeName)).toBeVisible()

    await undoButton(app).click()
    await expect(app.getByText(nodeName)).not.toBeVisible()

    await redoButton(app).click()
    await expect(app.getByText(nodeName)).toBeVisible()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('undo/redo add node via keyboard shortcuts', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-undo-keyboard')
  await createBasicWorkflow(app, workflowName, 'Initial action')

  const nodeName = 'Keyboard undo node'

  try {
    await addScriptNode(app, nodeName)
    await expect(app.getByText(nodeName)).toBeVisible()

    await app.keyboard.press('ControlOrMeta+z')
    await expect(app.getByText(nodeName)).not.toBeVisible()

    await app.keyboard.press('ControlOrMeta+Shift+z')
    await expect(app.getByText(nodeName)).toBeVisible()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('undo and redo buttons are disabled on fresh workflow load', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-undo-fresh')
  await createBasicWorkflow(app, workflowName, 'Initial action')

  try {
    await openWorkflowInBuilder(app, workflowName)

    await expect(undoButton(app)).toBeDisabled()
    await expect(redoButton(app)).toBeDisabled()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('undo history resets when navigating away from the builder', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-undo-nav-reset')
  await createBasicWorkflow(app, workflowName, 'Initial action')

  const nodeName = 'Nav reset node'

  try {
    await addScriptNode(app, nodeName)
    await expect(undoButton(app)).toBeEnabled()

    await app.goto(toAppUrl('/automations'))
    await expect(app.getByText('Automations', { exact: true }).first()).toBeVisible()

    await openWorkflowInBuilder(app, workflowName)

    await expect(undoButton(app)).toBeDisabled()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('undo/redo becomes disabled when entering execution view', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-undo-exec-view')
  await createBasicWorkflow(app, workflowName, 'Initial action')

  try {
    // Create an execution by running the workflow through the UI
    await app.getByRole('button', { name: 'Run', exact: true }).click()
    await app.getByRole('button', { name: 'Run now' }).click()

    // Execution may fail if the workflow engine (Temporal) is unavailable
    const didNavigate = await expect(app)
      .toHaveURL(/\/executions\//)
      .then(() => true)
      .catch(() => false)
    test.skip(!didNavigate, 'Workflow execution failed — execution engine may not be running')

    // Navigate back to the builder
    await openWorkflowInBuilder(app, workflowName)

    // Add two nodes then undo one so both undo and redo are enabled
    const nodeNameA = 'Exec view node A'
    const nodeNameB = 'Exec view node B'
    await addScriptNode(app, nodeNameA)
    await addScriptNode(app, nodeNameB)
    await undoButton(app).click()
    await expect(app.getByText(nodeNameB)).not.toBeVisible()

    await expect(undoButton(app)).toBeEnabled()
    await expect(redoButton(app)).toBeEnabled()

    // Open run history — the execution we just created should appear
    await app.getByRole('button', { name: 'Run history' }).click()
    await expect(app.getByRole('heading', { name: 'Run History' })).toBeVisible()

    // PF SimpleList (isControlled={false}) auto-selects the first execution,
    // so the execution view loads as soon as the history panel renders the list.
    await expect(app.getByRole('button', { name: 'Back to editor' })).toBeVisible()

    // Undo/redo toolbar should be hidden in execution view
    await expect(undoRedoToolbar(app)).not.toBeVisible()

    // Keyboard shortcut should have no effect in execution view
    await app.keyboard.press('ControlOrMeta+z')
    await app.getByRole('button', { name: 'Back to editor' }).click()
    await expect(app.getByText(nodeNameA)).toBeVisible()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})
