/**
 * E2E Tests: Scheduled Trigger
 *
 * Critical paths covered:
 * - Creating a workflow with a scheduled trigger and saving it
 * - Schedule form shows DateRangeCadencePicker for interval type
 * - Form validation: empty start date rejected
 * - Canvas rendering: correct label and detail text for scheduled triggers
 */

import { test, expect, toAppUrl } from './fixtures'
import { addScheduledTrigger } from './helpers/v2-nodes'
import {
  buildUniqueName,
  clickAddConnectedStep,
  closeNodeEditorPanel,
  deleteWorkflow,
  fillCodeEditor,
  selectProjectIfRequired,
} from './helpers/workflows'
import { ensureProject } from './utils/api'

test.describe('Scheduled Trigger', () => {
  test('user creates a workflow with scheduled trigger and saves it', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-scheduled')

    await ensureProject(app)
    await app.goto(toAppUrl('/workflow-builder/new'))

    try {
      await addScheduledTrigger(app, 'Daily Build', { startDate: '2026-01-15', cadence: 'daily' })

      // Add a connected script action
      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Action', exact: true }).click()
      await panel.getByRole('button', { name: 'Script', exact: true }).click()
      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Run build')
      await fillCodeEditor(app, { value: 'print("building")' })
      await app.getByRole('button', { name: 'Create' }).click()
      await closeNodeEditorPanel(app)

      // Save workflow
      await selectProjectIfRequired(app)
      await app.getByPlaceholder('Workflow name').fill(workflowName)
      await app.getByRole('button', { name: 'Save' }).click()
      await expect(app).toHaveURL(/workflow-builder\/.+/)

      // Verify workflow appears in list
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await expect(app.getByRole('button', { name: workflowName, exact: true })).toBeVisible()

      // Reopen workflow and verify trigger persists on canvas
      await app.getByRole('button', { name: workflowName, exact: true }).click()
      await expect(app.getByRole('heading', { name: 'Daily Build' })).toBeVisible({ timeout: 15_000 })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('schedule form shows date picker for interval type', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))

    await expect(app.getByRole('heading', { name: /select a trigger step/i })).toBeVisible({ timeout: 10_000 })
    await app.getByRole('button', { name: 'Schedule trigger', exact: true }).click()

    // DateRangeCadencePicker should be visible for the default "interval" schedule type
    await expect(app.getByTestId('date-range-cadence-picker')).toBeVisible({ timeout: 5_000 })
    await expect(app.getByLabel('Start date')).toBeVisible()
    await expect(app.getByLabel('Cadence')).toBeVisible()
  })

  test('schedule form validates empty start date', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))

    await expect(app.getByRole('heading', { name: /select a trigger step/i })).toBeVisible({ timeout: 10_000 })
    await app.getByRole('button', { name: 'Schedule trigger', exact: true }).click()

    // Leave start date empty, attempt to submit
    await app.getByRole('button', { name: 'Create' }).click()

    // Verify validation error
    await expect(app.getByText('Start date is required')).toBeVisible()
  })

  test('scheduled trigger displays correctly on canvas', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-sched-canvas')

    await ensureProject(app)
    await app.goto(toAppUrl('/workflow-builder/new'))

    try {
      await addScheduledTrigger(app, 'Weekly Sync', { startDate: '2026-03-01', cadence: 'weekly' })

      // Add a connected action so workflow can be saved
      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Action', exact: true }).click()
      await panel.getByRole('button', { name: 'Script', exact: true }).click()
      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Sync data')
      await fillCodeEditor(app, { value: 'print("syncing")' })
      await app.getByRole('button', { name: 'Create' }).click()
      await closeNodeEditorPanel(app)

      // Save workflow
      await selectProjectIfRequired(app)
      await app.getByPlaceholder('Workflow name').fill(workflowName)
      await app.getByRole('button', { name: 'Save' }).click()
      await expect(app).toHaveURL(/workflow-builder\/.+/)

      // Verify trigger node on canvas shows schedule detail
      const triggerHeading = app.getByRole('heading', { name: 'Weekly Sync' })
      await expect(triggerHeading).toBeVisible({ timeout: 5_000 })

      // Click the trigger node to verify details panel opens
      await triggerHeading.click()
      await expect(app.getByRole('heading', { name: 'Output', exact: true })).toBeVisible({ timeout: 10_000 })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})
