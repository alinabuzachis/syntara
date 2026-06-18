/**
 * E2E Tests (UI-20): Execution — Manual Run from Canvas
 *
 * Objective: Verify that a workflow can be manually run from the builder canvas,
 * that the live run details panel appears, and that node status badges update
 * in real time as Temporal executes the workflow.
 *
 * Test coverage:
 * - Clicking Run and confirming opens the "Run details" panel
 * - Node status badges show Success after execution completes
 * - Failed nodes show an error status badge
 */

import { test, expect } from '../fixtures'
import { buildUniqueName, openBuilderById } from '../helpers/workflows'
import { createWorkflowViaApi, deleteWorkflowViaApi } from '../utils/api'

test('clicking Run and confirming opens the live run details panel', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-manual-run')
  // validateMinimumWorkflow requires: trigger + at least one node + an edge connecting them
  const workflowId = await createWorkflowViaApi(
    app,
    workflowName,
    [{ id: 'trigger_1', type: 'manual_trigger', name: 'Manual trigger', parameters: {} }],
    [{ id: 'action_1', type: 'script', name: 'Test step', parameters: { language: 'python', code: "print('hi')" } }],
    [{ from: 'trigger_1', to: 'action_1' }]
  )
  try {
    await openBuilderById(app, workflowId)
    await expect(app.getByText('Manual trigger')).toBeVisible({ timeout: 30_000 })

    await app.getByRole('button', { name: 'Run' }).click()
    const dialog = app.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Run now' }).click()
    await expect(dialog).not.toBeVisible()

    // The run details panel appears below the canvas once execution completes
    await expect(app.getByRole('heading', { name: 'Run details' })).toBeVisible({ timeout: 30_000 })
  } finally {
    await deleteWorkflowViaApi(app, workflowId)
  }
})

test('node status badges show success after execution completes', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-manual-run-badge')
  const workflowId = await createWorkflowViaApi(
    app,
    workflowName,
    [{ id: 'trigger_1', type: 'manual_trigger', name: 'Manual trigger', parameters: {} }],
    [{ id: 'action_1', type: 'script', name: 'Test action', parameters: { language: 'python', code: "print('hi')" } }],
    [{ from: 'trigger_1', to: 'action_1' }]
  )
  try {
    await openBuilderById(app, workflowId)
    await expect(app.getByText('Manual trigger')).toBeVisible({ timeout: 30_000 })

    await app.getByRole('button', { name: 'Run' }).click()
    await app.getByRole('dialog').getByRole('button', { name: 'Run now' }).click()

    await expect(app.getByRole('img', { name: 'Success' })).toHaveCount(2, { timeout: 30_000 })
  } finally {
    await deleteWorkflowViaApi(app, workflowId)
  }
})

test('failed nodes show an error status badge', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-manual-run-fail')
  const workflowId = await createWorkflowViaApi(
    app,
    workflowName,
    [{ id: 'trigger_1', type: 'manual_trigger', name: 'Manual trigger', parameters: {} }],
    [
      {
        id: 'action_1',
        type: 'script',
        name: 'Failing action',
        parameters: { language: 'python', code: 'raise Exception("fail")' },
      },
    ],
    [{ from: 'trigger_1', to: 'action_1' }]
  )
  try {
    await openBuilderById(app, workflowId)
    await expect(app.getByText('Manual trigger')).toBeVisible({ timeout: 30_000 })

    await app.getByRole('button', { name: 'Run' }).click()
    await app.getByRole('dialog').getByRole('button', { name: 'Run now' }).click()

    // Failed node shows an error badge
    await expect(app.getByRole('img', { name: 'Error' })).toBeVisible({ timeout: 60_000 })
  } finally {
    await deleteWorkflowViaApi(app, workflowId)
  }
})
