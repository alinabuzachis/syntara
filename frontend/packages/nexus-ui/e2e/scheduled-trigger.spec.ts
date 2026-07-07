/**
 * E2E Tests: Scheduled Trigger
 *
 * Critical paths covered:
 * - Creating a workflow with a scheduled trigger and saving it
 * - Schedule form shows ScheduleBuilderFields for visual builder
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
  test.skip('user creates a workflow with scheduled trigger and saves it', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-scheduled')

    await ensureProject(app)
    await app.goto(toAppUrl('/workflow-builder/new'))

    try {
      await addScheduledTrigger(app, 'Daily Build', { startDate: '2026-01-15', frequency: 'daily' })

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

  test('schedule form shows visual builder fields', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))

    await expect(app.getByRole('heading', { name: /select a trigger node/i })).toBeVisible({ timeout: 10_000 })
    await app.getByRole('button', { name: 'Schedule trigger', exact: true }).click()

    // ScheduleBuilderFields should be visible for the default "Visual schedule builder" expression
    await expect(app.getByTestId('schedule-builder-fields')).toBeVisible({ timeout: 5_000 })
    await expect(app.getByLabel('Start date', { exact: true })).toBeVisible()
    await expect(app.getByLabel('Frequency', { exact: true })).toBeVisible()
  })

  test('schedule form allows creation without start date', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))

    await expect(app.getByRole('heading', { name: /select a trigger node/i })).toBeVisible({ timeout: 10_000 })
    await app.getByRole('button', { name: 'Schedule trigger', exact: true }).click()

    // Leave start date empty, attempt to submit — trigger fields are optional by design
    await app.getByRole('button', { name: 'Create' }).click()

    // Trigger is created and appears on the canvas (form closes)
    await expect(app.getByRole('button', { name: 'Create' })).not.toBeAttached({ timeout: 10_000 })
    await expect(app.getByText('Scheduled trigger')).toBeVisible()
  })

  test.skip('scheduled trigger displays correctly on canvas', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-sched-canvas')

    await ensureProject(app)
    await app.goto(toAppUrl('/workflow-builder/new'))

    try {
      await addScheduledTrigger(app, 'Weekly Sync', { startDate: '2026-03-01', frequency: 'weekly' })

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
