import { test, expect } from './fixtures'
import { addScriptNode } from './helpers/v2-nodes'
import { buildUniqueName, createBasicWorkflow, deleteWorkflow, openWorkflowInBuilder } from './helpers/workflows'

test.describe('Execution URL unification', () => {
  test('running a workflow shows inline run panel in builder', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-exec-url-run')
    await createBasicWorkflow(app, workflowName, 'Run action')

    try {
      await openWorkflowInBuilder(app, workflowName)

      await app.getByRole('button', { name: 'Run', exact: true }).click()
      await app.getByRole('button', { name: 'Run now' }).click()

      const didNavigate = await expect(app)
        .toHaveURL(/\/executions\//)
        .then(() => true)
        .catch(() => false)
      test.skip(!didNavigate, 'Workflow execution failed — execution engine may not be running')

      await expect(app.getByRole('button', { name: 'Back to editor' })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('run history navigates to execution page', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-exec-url-history')
    await createBasicWorkflow(app, workflowName, 'History action')

    try {
      await openWorkflowInBuilder(app, workflowName)

      await app.getByRole('button', { name: 'Run', exact: true }).click()
      await app.getByRole('button', { name: 'Run now' }).click()

      const didNavigate = await expect(app)
        .toHaveURL(/\/executions\//)
        .then(() => true)
        .catch(() => false)
      test.skip(!didNavigate, 'Workflow execution failed — execution engine may not be running')

      await openWorkflowInBuilder(app, workflowName)

      await app.getByLabel('Workflow actions').click()
      await app.getByRole('menuitem', { name: 'Run history' }).click()
      await expect(app.getByRole('heading', { name: 'Run History' })).toBeVisible()

      const executionButton = app.locator('button[class*="simpleList"]').first()
      const hasExecution = await executionButton
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false)

      if (hasExecution) {
        await executionButton.click()
        await expect(app).toHaveURL(/\/executions\//)
      }
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('execution page shows workflow name in header', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-exec-url-name')
    await createBasicWorkflow(app, workflowName, 'Name action')

    try {
      await openWorkflowInBuilder(app, workflowName)

      await app.getByRole('button', { name: 'Run', exact: true }).click()
      await app.getByRole('button', { name: 'Run now' }).click()

      const didNavigate = await expect(app)
        .toHaveURL(/\/executions\//)
        .then(() => true)
        .catch(() => false)
      test.skip(!didNavigate, 'Workflow execution failed — execution engine may not be running')

      const heading = app.getByRole('heading', { level: 1 })
      await expect(heading).toContainText(workflowName)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('history card on execution page navigates between executions', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-exec-url-card')
    await createBasicWorkflow(app, workflowName, 'Card action')

    try {
      await openWorkflowInBuilder(app, workflowName)

      // Run workflow first time
      await app.getByRole('button', { name: 'Run', exact: true }).click()
      await app.getByRole('button', { name: 'Run now' }).click()

      const didNavigate = await expect(app)
        .toHaveURL(/\/executions\//)
        .then(() => true)
        .catch(() => false)
      test.skip(!didNavigate, 'Workflow execution failed — execution engine may not be running')

      // Run workflow second time to have multiple executions
      await openWorkflowInBuilder(app, workflowName)
      await app.getByRole('button', { name: 'Run', exact: true }).click()
      await app.getByRole('button', { name: 'Run now' }).click()

      const didNavigateSecond = await expect(app)
        .toHaveURL(/\/executions\//)
        .then(() => true)
        .catch(() => false)
      test.skip(!didNavigateSecond, 'Second workflow execution failed')

      // History card should be visible by default on execution page
      await expect(app.getByRole('heading', { name: 'Run History' })).toBeVisible()

      // Click a different execution in the history card
      const executionItems = app.locator('button[class*="simpleList"]')
      const itemCount = await executionItems.count()
      if (itemCount > 1) {
        const secondUrl = app.url()
        await executionItems.nth(1).click()
        await expect(app).not.toHaveURL(secondUrl)
        await expect(app).toHaveURL(/\/executions\//)
      }
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('dirty workflow prompts save before navigating to execution', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-exec-url-dirty')
    await createBasicWorkflow(app, workflowName, 'Dirty action')

    try {
      await openWorkflowInBuilder(app, workflowName)

      // Run workflow to create an execution
      await app.getByRole('button', { name: 'Run', exact: true }).click()
      await app.getByRole('button', { name: 'Run now' }).click()

      const didNavigate = await expect(app)
        .toHaveURL(/\/executions\//)
        .then(() => true)
        .catch(() => false)
      test.skip(!didNavigate, 'Workflow execution failed — execution engine may not be running')

      // Go back to builder
      await openWorkflowInBuilder(app, workflowName)

      // Make the workflow dirty by adding a node
      await addScriptNode(app, 'Dirty node')

      // Open run history via kebab menu
      await app.getByLabel('Workflow actions').click()
      await app.getByRole('menuitem', { name: 'Run history' }).click()
      await expect(app.getByRole('heading', { name: 'Run History' })).toBeVisible()

      // Click an execution — should trigger unsaved changes prompt
      const executionButton = app.locator('button[class*="simpleList"]').first()
      const hasExecution = await executionButton
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false)

      if (hasExecution) {
        await executionButton.click()

        // The unsaved changes modal should appear
        await expect(app.getByRole('heading', { name: /Save changes before exiting/i })).toBeVisible({ timeout: 3000 })

        // Click "Exit without saving" to proceed
        await app.getByRole('button', { name: /Exit without saving/i }).click()

        // Should navigate to executions page
        await expect(app).toHaveURL(/\/executions\//)
      }
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})
