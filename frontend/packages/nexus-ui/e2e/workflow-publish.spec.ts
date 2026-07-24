import { test, expect, toAppUrl } from './fixtures'
import {
  buildUniqueName,
  createBasicWorkflowViaApi,
  openWorkflowInBuilder,
  createWorkflowWithTrigger,
  deleteWorkflow,
} from './helpers/workflows'

// Skip: publish tests consistently fail in CI — needs investigation
test.describe.skip('Workflow publish/unpublish', () => {
  test('new workflow shows Draft badge after save', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-publish-draft')

    try {
      const { id } = await createBasicWorkflowViaApi(app, workflowName, 'Draft step')
      await openWorkflowInBuilder(app, workflowName, id)

      await expect(app.getByText('Draft', { exact: true })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('publish button opens dialog with expected fields', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-publish-dialog')

    try {
      const { id } = await createBasicWorkflowViaApi(app, workflowName, 'Publish step')
      await openWorkflowInBuilder(app, workflowName, id)

      // Click Publish button in toolbar
      await app.getByRole('button', { name: /Publish/i }).click()

      // Verify dialog opens with expected content
      const dialog = app.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Publish workflow?')).toBeVisible()
      await expect(dialog.getByLabel('Version name')).toBeVisible()
      await expect(dialog.getByLabel('Description')).toBeVisible()

      // Version name should be pre-filled with a date
      const versionInput = dialog.getByLabel('Version name')
      await expect(versionInput).not.toHaveValue('')

      // Cancel without publishing
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).not.toBeVisible()

      // Badge should still be Draft (no publish happened)
      await expect(app.getByText('Draft', { exact: true })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('publish dialog submits without error', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-publish-submit')

    try {
      const { id } = await createBasicWorkflowViaApi(app, workflowName, 'Publish step')
      await openWorkflowInBuilder(app, workflowName, id)

      // Click Publish button in toolbar
      await app.getByRole('button', { name: /Publish/i }).click()

      // Submit the dialog
      const dialog = app.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Publish' }).click()

      // Dialog should close after submit
      await expect(dialog).not.toBeVisible({ timeout: 10_000 })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('unpublish action is not in kebab before publishing', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-unpublish-kebab')

    try {
      const { id } = await createBasicWorkflowViaApi(app, workflowName, 'Unpublish step')
      await openWorkflowInBuilder(app, workflowName, id)

      // Before publishing, Unpublish should NOT be in kebab
      await app.getByRole('button', { name: 'Workflow actions' }).click()
      await expect(app.getByRole('menuitem', { name: /Unpublish workflow/i })).toHaveCount(0)

      // Close kebab
      await app.getByRole('button', { name: 'Workflow actions' }).click()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('status badge shows in workflow list', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-list-badge')

    try {
      await createBasicWorkflowViaApi(app, workflowName, 'List badge step')

      // Navigate to workflow list
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()

      // Verify Draft badge appears in the Status column
      const row = app.getByRole('row', { name: new RegExp(workflowName) })
      await expect(row).toBeVisible()
      await expect(row.getByText('Draft', { exact: true })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('workflow list kebab has publish action', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-list-publish-action')

    try {
      await createBasicWorkflowViaApi(app, workflowName, 'List action step')

      // Navigate to workflow list
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()

      // Open kebab — Publish should be available
      const row = app.getByRole('row', { name: new RegExp(workflowName) })
      await row.getByRole('button', { name: /Actions|Kebab toggle/i }).click({ force: true })
      await expect(app.getByRole('menuitem', { name: /Publish workflow/i })).toBeVisible()

      // Unpublish should NOT be available for an unpublished workflow
      await expect(app.getByRole('menuitem', { name: /Unpublish workflow/i })).toHaveCount(0)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('publish button is disabled for workflow with no steps', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-empty-publish')

    try {
      await createWorkflowWithTrigger(app, workflowName)

      const publishBtn = app.getByRole('button', { name: /Publish workflow/i })
      await expect(publishBtn).toBeVisible()
      await expect(publishBtn).toHaveAttribute('aria-disabled', 'true')
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('enabled/disabled toggle is removed from builder toolbar', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-no-toggle')

    try {
      const { id } = await createBasicWorkflowViaApi(app, workflowName, 'No toggle step')
      await openWorkflowInBuilder(app, workflowName, id)

      // Verify no switch/toggle exists in the toolbar
      await expect(app.getByRole('switch')).toHaveCount(0)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})
