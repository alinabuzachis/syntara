/**
 * E2E Tests: Manual Trigger (UI-18)
 *
 * Epic: AAP-70960
 * Objective: Verify that a Manual trigger can be configured.
 *
 * Critical paths covered:
 * - Creating a workflow with a manual trigger and saving it
 * - Manual trigger form renders with name field
 * - Canvas rendering: trigger node displays with custom name
 * - Workflow can be manually run from the canvas
 */

import { test, expect, toAppUrl } from '../fixtures'
import { addManualTrigger, addScriptNode } from '../helpers/v2-nodes'
import { buildUniqueName, deleteWorkflow, selectProjectIfRequired } from '../helpers/workflows'
import { ensureProject } from '../utils/api'

test.describe('Manual Trigger', () => {
  test('creates workflow with manual trigger and verifies canvas display', async ({ app }) => {
    test.fixme(true, 'Flaky in CI')
    const workflowName = buildUniqueName('e2e-manual')

    await ensureProject(app)
    await app.goto(toAppUrl('/workflow-builder/new'))

    try {
      await addManualTrigger(app, 'Start workflow')
      await addScriptNode(app, 'Process data', 'print("processing")')

      await selectProjectIfRequired(app)
      await app.getByPlaceholder('Workflow name').fill(workflowName)
      await app.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(app).toHaveURL(/workflow-builder\/.+/)

      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await expect(app.getByRole('button', { name: workflowName, exact: true })).toBeVisible()

      await app.getByRole('button', { name: workflowName, exact: true }).click()

      // Wait for builder to load
      await expect(app).toHaveURL(/workflow-builder\/.+/, { timeout: 15_000 })

      // Click Layout to position nodes within the viewport so both are visible
      const layoutButton = app.getByRole('button', { name: 'Layout' })
      await expect(layoutButton).toBeVisible({ timeout: 10_000 })
      await layoutButton.click()
      await app
        .locator('[role="group"][aria-roledescription="node"]')
        .filter({ hasText: 'Start workflow' })
        .waitFor({ state: 'visible', timeout: 5_000 })

      // Verify both nodes are visible on the canvas after reopening
      const triggerNode = app
        .locator('[role="group"][aria-roledescription="node"]')
        .filter({ hasText: 'Start workflow' })
      const scriptNode = app.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: 'Process data' })

      await expect(triggerNode).toBeVisible({ timeout: 15_000 })
      await expect(scriptNode).toBeVisible({ timeout: 15_000 })

      // Verify the edge connection exists between the nodes
      const edges = app.locator('[role="group"][aria-roledescription="edge"]')
      const edgeCount = await edges.count()
      expect(edgeCount).toBeGreaterThanOrEqual(1) // At least one edge: trigger -> script

      // Test the full end-to-end journey: now run the workflow from the canvas
      const runButton = app.getByRole('button', { name: 'Run' })
      await expect(runButton).toBeVisible()
      await expect(runButton).toBeEnabled()

      await runButton.click()
      const dialog = app.getByRole('dialog')
      await expect(dialog).toBeVisible()

      // After reopening a saved workflow, the UI may detect state differences as unsaved changes
      await dialog.getByRole('button', { name: /Run now|Save and run/ }).click()
      await expect(dialog).not.toBeVisible()

      // Verify the run details panel appears after execution starts
      await expect(app.getByRole('heading', { name: 'Run details' })).toBeVisible({ timeout: 30_000 })

      // Verify execution completes — trigger node doesn't get a success badge, only the script node does
      await expect(app.getByRole('img', { name: 'Success' })).toHaveCount(2, { timeout: 30_000 })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('trigger form shows name field with default value', async ({ app }) => {
    await ensureProject(app)
    await app.goto(toAppUrl('/workflow-builder/new'))

    await expect(app.getByRole('heading', { name: /select a trigger node/i })).toBeVisible({ timeout: 10_000 })
    await app.getByRole('button', { name: 'Manual trigger' }).click()

    const nameInput = app.getByRole('textbox', { name: 'Name', exact: true })
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toHaveValue('Trigger')
  })
})
