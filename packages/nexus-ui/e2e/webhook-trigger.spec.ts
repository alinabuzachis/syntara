/**
 * E2E Tests: Webhook (API) Trigger
 *
 * Critical paths covered:
 * - Creating a workflow with a webhook trigger and saving it
 * - Webhook URL preview updates dynamically as the path is typed
 * - Form validation: empty path, invalid characters
 * - Path normalization (leading slash stripped, lowercased)
 * - Canvas rendering: correct label and detail text for webhook triggers
 *
 * Edge cases:
 * - Empty webhook path rejected with validation error
 * - Invalid characters rejected with descriptive error
 * - Leading slashes and mixed case are normalized on submit
 */

import { test, expect, toAppUrl } from './fixtures'
import { addWebhookTrigger } from './helpers/v2-nodes'
import {
  buildUniqueName,
  clickAddConnectedStep,
  closeNodeEditorPanel,
  deleteWorkflow,
  fillCodeEditor,
  selectProjectIfRequired,
} from './helpers/workflows'
import { ensureProject } from './utils/api'

test.describe('Webhook Trigger', () => {
  test('user creates a workflow with webhook trigger and saves it', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-webhook')
    const webhookPath = 'jira-updates'

    await ensureProject(app)
    await app.goto(toAppUrl('/workflow-builder/new'))

    try {
      // Add webhook trigger
      await addWebhookTrigger(app, 'Jira Webhook', webhookPath)

      // Add a connected script action
      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Action', exact: true }).click()
      await panel.getByRole('button', { name: 'Script', exact: true }).click()
      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Process payload')
      await fillCodeEditor(app, { value: 'print("processing webhook")' })
      await app.getByRole('button', { name: 'Save and close' }).click()
      await closeNodeEditorPanel(app)

      // Save workflow (select project right before save)
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
      await expect(app.locator('.react-flow__node').filter({ hasText: 'Webhook' })).toBeVisible({ timeout: 15_000 })

      const triggerNode = app.locator('.react-flow__node').filter({ hasText: `Webhook: /${webhookPath}` })
      await expect(triggerNode).toBeVisible({ timeout: 5_000 })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('webhook form shows URL preview that updates with path input', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))

    // Wait for trigger selection and select Webhook trigger
    await expect(app.getByRole('heading', { name: /select a trigger step/i })).toBeVisible({ timeout: 10_000 })
    await app.getByRole('button', { name: 'Webhook trigger', exact: true }).click()

    // Type a path
    await app.getByRole('textbox', { name: 'Webhook path' }).fill('github-push')

    // Expand the ClipboardCopy to reveal the URL text and verify it contains the path
    const clipboardCopy = app.getByLabel('Webhook URL')
    await expect(clipboardCopy).toBeVisible()
    const expandToggle = clipboardCopy.getByRole('button', { name: /show content/i })
    await expandToggle.click()
    await expect(clipboardCopy).toContainText('github-push')

    // Change the path and verify URL reflects the change
    await app.getByRole('textbox', { name: 'Webhook path' }).fill('slack-events')
    await expect(clipboardCopy).toContainText('slack-events')
    await expect(clipboardCopy).not.toContainText('github-push')
  })

  test('webhook form shows HTTP method as disabled POST', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))

    await expect(app.getByRole('heading', { name: /select a trigger step/i })).toBeVisible({ timeout: 10_000 })
    await app.getByRole('button', { name: 'Webhook trigger', exact: true }).click()

    const httpMethod = app.getByRole('textbox', { name: 'HTTP method' })
    await expect(httpMethod).toBeVisible()
    await expect(httpMethod).toHaveValue('POST')
    await expect(httpMethod).toBeDisabled()
  })

  test('webhook form validates empty path', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))

    await expect(app.getByRole('heading', { name: /select a trigger step/i })).toBeVisible({ timeout: 10_000 })
    await app.getByRole('button', { name: 'Webhook trigger', exact: true }).click()

    // Leave webhook path empty, attempt to submit
    await app.getByRole('button', { name: 'Save and close' }).click()

    // Verify validation error
    await expect(app.getByText('Webhook path is required')).toBeVisible()
  })

  test('webhook form validates invalid path characters', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))

    await expect(app.getByRole('heading', { name: /select a trigger step/i })).toBeVisible({ timeout: 10_000 })
    await app.getByRole('button', { name: 'Webhook trigger', exact: true }).click()

    // Enter invalid characters
    await app.getByRole('textbox', { name: 'Webhook path' }).fill('invalid path!@#')
    await app.getByRole('button', { name: 'Save and close' }).click()

    // Verify validation error
    await expect(
      app.getByText(
        'Path must start and end with a letter or number, and contain only lowercase letters, numbers, hyphens, and underscores'
      )
    ).toBeVisible()
  })

  test('webhook form normalizes path on submit', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-webhook-norm')

    await ensureProject(app)
    await app.goto(toAppUrl('/workflow-builder/new'))

    try {
      // Add webhook trigger with leading slash and mixed case
      await addWebhookTrigger(app, 'Normalized Webhook', '/Jira-Updates')

      // Add a connected script action so workflow can be saved
      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Action', exact: true }).click()
      await panel.getByRole('button', { name: 'Script', exact: true }).click()
      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Action')
      await fillCodeEditor(app, { value: 'print("ok")' })
      await app.getByRole('button', { name: 'Save and close' }).click()
      await closeNodeEditorPanel(app)

      // Save and verify canvas shows normalized path (lowercase, no leading slash)
      await selectProjectIfRequired(app)
      await app.getByPlaceholder('Workflow name').fill(workflowName)
      await app.getByRole('button', { name: 'Save' }).click()
      await expect(app).toHaveURL(/workflow-builder\/.+/)

      const triggerNode = app.locator('.react-flow__node').filter({ hasText: 'Webhook: /jira-updates' })
      await expect(triggerNode).toBeVisible({ timeout: 5_000 })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('webhook trigger displays correctly on canvas', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-webhook-canvas')
    const webhookPath = 'api-v2-events'

    await ensureProject(app)
    await app.goto(toAppUrl('/workflow-builder/new'))

    try {
      // Add webhook trigger
      await addWebhookTrigger(app, 'Events Webhook', webhookPath)

      // Add a connected action so workflow can be saved
      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Action', exact: true }).click()
      await panel.getByRole('button', { name: 'Script', exact: true }).click()
      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Handle event')
      await fillCodeEditor(app, { value: 'print("event")' })
      await app.getByRole('button', { name: 'Save and close' }).click()
      await closeNodeEditorPanel(app)

      // Save workflow
      await selectProjectIfRequired(app)
      await app.getByPlaceholder('Workflow name').fill(workflowName)
      await app.getByRole('button', { name: 'Save' }).click()
      await expect(app).toHaveURL(/workflow-builder\/.+/)

      // Verify trigger node on canvas shows webhook path detail
      const triggerNode = app.locator('.react-flow__node').filter({ hasText: `Webhook: /${webhookPath}` })
      await expect(triggerNode).toBeVisible({ timeout: 5_000 })

      // Click the trigger node to verify details panel opens
      await triggerNode.click()
      await expect(app.getByRole('heading', { name: 'Output', exact: true })).toBeVisible({ timeout: 10_000 })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})
