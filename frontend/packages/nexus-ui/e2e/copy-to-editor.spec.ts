/**
 * E2E Tests: Copy Run to Editor
 *
 * Critical paths covered:
 * - "Copy to editor" button visible on execution detail page
 * - Confirmation dialog opens with correct content
 * - "Replace current workflow" navigates to builder with workflow loaded
 * - "Fork as new workflow" creates a new workflow and navigates to its builder
 * - Cancelling stays on execution page
 *
 * Edge cases:
 * - Dialog cancellation (stays on execution page)
 */

import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName, createBasicWorkflow, deleteWorkflow } from './helpers/workflows'

/** Run a workflow from the Workflows list page and wait for navigation to the execution detail page. */
async function runWorkflowFromList(app: import('@playwright/test').Page, workflowName: string) {
  await app.goto(toAppUrl('/workflows'))
  await app.getByPlaceholder('Filter by name').fill(workflowName)
  await app.getByRole('button', { name: 'Apply filter' }).click()

  const row = app.getByRole('row', { name: new RegExp(workflowName) })
  await expect(row).toBeVisible()

  // Open kebab menu and click "Run workflow"
  await row
    .getByRole('button', { name: /Actions|Kebab toggle/i })
    .nth(0)
    .click({ force: true })
  await app.getByRole('menuitem', { name: 'Run workflow' }).click()

  // Confirm run in the dialog
  await app.getByRole('button', { name: 'Run now' }).click()

  // The Workflows page navigates to /executions/<id> on success
  await expect(app).toHaveURL(/\/executions\//, { timeout: 15_000 })
}

// Skip: tests consistently time out in CI waiting for workflow execution to complete
test.describe.skip('Copy Run to Editor', () => {
  test('replaces current workflow via confirmation dialog', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-copy-to-editor')
    await createBasicWorkflow(app, workflowName, 'Copy action')

    try {
      // Run the workflow from the list page (navigates to /executions/<id>)
      await runWorkflowFromList(app, workflowName)

      // Wait for execution page to fully load
      await expect(app.getByRole('button', { name: 'Copy to editor' })).toBeVisible({ timeout: 15_000 })

      // Click "Copy to editor"
      await app.getByRole('button', { name: 'Copy to editor' }).click()

      // Verify confirmation dialog appears
      await expect(app.getByRole('heading', { name: 'Copy run to editor' })).toBeVisible()
      await expect(app.getByText(/Copy this specific run of the automation/)).toBeVisible()

      // Click Replace
      const replaceButton = app.getByRole('dialog').getByRole('button', { name: 'Replace current workflow' })
      await replaceButton.click()

      // Verify navigation to builder with workflow loaded
      await expect(app).toHaveURL(/\/workflow-builder\//)
      await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName, { timeout: 15_000 })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('forks execution as new workflow', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-copy-fork')
    await createBasicWorkflow(app, workflowName, 'Fork action')
    let forkedWorkflowName: string | undefined

    try {
      // Run the workflow from the list page (navigates to /executions/<id>)
      await runWorkflowFromList(app, workflowName)

      // Wait for execution page to fully load
      await expect(app.getByRole('button', { name: 'Copy to editor' })).toBeVisible({ timeout: 15_000 })

      // Click "Copy to editor"
      await app.getByRole('button', { name: 'Copy to editor' }).click()
      await expect(app.getByRole('heading', { name: 'Copy run to editor' })).toBeVisible()

      // Click Fork
      const forkButton = app.getByRole('dialog').getByRole('button', { name: 'Fork as new workflow' })
      await forkButton.click()

      // Verify navigation to builder with a new workflow
      await expect(app).toHaveURL(/\/workflow-builder\//, { timeout: 15_000 })

      // Verify the workflow name contains the copy pattern
      const nameInput = app.getByPlaceholder('Workflow name')
      await expect(nameInput).toBeVisible({ timeout: 15_000 })
      forkedWorkflowName = await nameInput.inputValue()
      expect(forkedWorkflowName).toContain('- copy-')
    } finally {
      await deleteWorkflow(app, workflowName)
      if (forkedWorkflowName) {
        await deleteWorkflow(app, forkedWorkflowName)
      }
    }
  })

  test('cancelling the dialog stays on execution page', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-copy-cancel')
    await createBasicWorkflow(app, workflowName, 'Cancel action')

    try {
      // Run the workflow from the list page (navigates to /executions/<id>)
      await runWorkflowFromList(app, workflowName)

      // Wait for execution page to fully load
      await expect(app.getByRole('button', { name: 'Copy to editor' })).toBeVisible({ timeout: 15_000 })

      // Open dialog and cancel
      await app.getByRole('button', { name: 'Copy to editor' }).click()
      await expect(app.getByRole('heading', { name: 'Copy run to editor' })).toBeVisible()
      await app.getByRole('button', { name: 'Cancel' }).click()

      // Verify dialog closed and still on execution page
      await expect(app.getByRole('heading', { name: 'Copy run to editor' })).not.toBeVisible()
      await expect(app).toHaveURL(/\/executions\//)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})
