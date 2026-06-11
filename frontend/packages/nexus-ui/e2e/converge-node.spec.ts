import { type Page, type Request, test, expect, toAppUrl } from './fixtures'
import {
  addConvergeNodeWithAllStrategy,
  addConvergeNodeWithAnyStrategy,
  addConvergeNodeWithTimeout,
  addManualTrigger,
  addConditionNodeWithBranch,
  createWorkflowWithBranchesForConverge,
  expectConvergeNodeConfig,
  openConvergeFormOnNewWorkflow,
} from './helpers/v2-nodes'
import {
  addNodePanel,
  selectProjectIfRequired,
  deleteWorkflow,
  closeNodeEditorPanel,
  openWorkflowInBuilder,
} from './helpers/workflows'

type WorkflowNode = {
  id: string
  type: string
  name?: string
  config: Record<string, unknown>
}

type WorkflowPayload = {
  workflow_definition: {
    nodes: WorkflowNode[]
  }
}

/** Extract the typed workflow payload from a Playwright request. */
function getWorkflowPayload(request: Request): WorkflowPayload {
  return request.postDataJSON() as WorkflowPayload
}

/** Click "Cancel without saving" if visible, then clean up any remaining panel. */
async function cancelAndCloseEditor(app: Page) {
  const cancelBtn = app.getByRole('button', { name: 'Cancel without saving' })
  if ((await cancelBtn.count()) > 0) {
    await cancelBtn.click()
  }
  await closeNodeEditorPanel(app)
}

test.describe('Converge Node - E2E Tests', () => {
  test.describe('Catalog', () => {
    test('Select converge node from Logic category', async ({ app }) => {
      try {
        await app.goto(toAppUrl('/workflow-builder/new'))
        await addManualTrigger(app, 'Manual trigger')
        await addConditionNodeWithBranch(app, 'Condition', 'true')

        const layoutButton = app.getByRole('button', { name: 'Layout' })
        if ((await layoutButton.count()) > 0) {
          await layoutButton.click()
        }

        const addBtn = app.locator('.react-flow').getByRole('button', { name: 'Add connected step' }).nth(0)
        await expect(addBtn).toBeVisible({ timeout: 10_000 })
        await addBtn.click({ force: true })

        const panel = addNodePanel(app)
        await expect(panel).toHaveCount(1)
        await panel.getByRole('button', { name: 'Logic', exact: true }).click()
        const convergeBtn = panel.getByRole('button', { name: 'Converge', exact: true })
        await expect(convergeBtn).toBeVisible()
        await convergeBtn.click()

        await expect(app.getByRole('combobox', { name: /Continue when criteria/i })).toBeVisible()
        await expect(app.getByRole('combobox', { name: /Continue when criteria/i })).toHaveValue('all')
        await expect(app.getByRole('switch', { name: /Timeout/i })).not.toBeChecked()
      } finally {
        await cancelAndCloseEditor(app)
      }
    })

    test('Cancel adding converge node', async ({ app }) => {
      await openConvergeFormOnNewWorkflow(app)

      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Test Converge')
      await app.getByRole('combobox', { name: /Continue when criteria/i }).selectOption('any')

      const cancelButton = app.getByRole('button', { name: 'Cancel without saving' })
      await expect(cancelButton).toBeVisible()
      await cancelButton.click()

      await expect(app.getByRole('combobox', { name: /Continue when criteria/i })).not.toBeVisible()
      await expect(app.getByText('Test Converge')).not.toBeVisible()
    })
  })

  test.describe('Wait for all branches', () => {
    test('Create converge node with "all" strategy (default)', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithAllStrategy(app, 'Converge All')

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'POST'
        )
        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        await expect(app.getByText('Converge All')).toBeVisible()
        const payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, { strategy: 'all' })
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })

    test('Edit existing converge node with "all" strategy', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithAllStrategy(app, 'Converge All')

        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        await expect(app).toHaveURL(/workflow-builder\/.+/)

        await openWorkflowInBuilder(app, wfName)
        await app.getByText('Converge All').click()

        await expect(app.getByRole('combobox', { name: /Continue when criteria/i })).toHaveValue('all')

        await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Updated Converge')
        await app.getByRole('button', { name: 'Save and close' }).click()

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'PATCH'
        )
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        const payload = getWorkflowPayload(saveRequest)
        const convergeNode = payload.workflow_definition.nodes.find((n) => n.type === 'converge')
        expect(convergeNode?.name).toBe('Updated Converge')
        expect(convergeNode?.config.strategy).toBe('all')
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })

    test('Switch from "any" to "all" strategy', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithAnyStrategy(app, 'Converge Any', 2)

        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        await expect(app).toHaveURL(/workflow-builder\/.+/)

        await openWorkflowInBuilder(app, wfName)
        await app.getByText('Converge Any').click()

        await app.getByRole('combobox', { name: /Continue when criteria/i }).selectOption('all')

        await expect(
          app.getByRole('spinbutton', { name: /Required number of branches before continuing/i })
        ).not.toBeVisible()

        await app.getByRole('button', { name: 'Save and close' }).click()

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'PATCH'
        )
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        const payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, { strategy: 'all' })
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })
  })

  test.describe('Wait for N of M branches', () => {
    test('Create converge node with "any" strategy and valid N', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithAnyStrategy(app, 'Converge Any', 1)

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'POST'
        )
        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        const payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, { strategy: 'any', n_required: 1 })
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })

    test('Edit converge node with "any" strategy', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithAnyStrategy(app, 'Converge Any', 2)

        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        await expect(app).toHaveURL(/workflow-builder\/.+/)

        await openWorkflowInBuilder(app, wfName)
        await app.getByText('Converge Any').click()

        const requiredPathCountInput = app.getByRole('spinbutton', {
          name: /Required number of branches before continuing/i,
        })
        await expect(requiredPathCountInput).toHaveValue('2')

        await requiredPathCountInput.fill('1')
        await app.getByRole('button', { name: 'Save and close' }).click()

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'PATCH'
        )
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        const payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, { strategy: 'any', n_required: 1 })
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })

    test('Switch from "all" to "any" strategy', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithAllStrategy(app, 'Converge All')

        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        await expect(app).toHaveURL(/workflow-builder\/.+/)

        await openWorkflowInBuilder(app, wfName)
        await app.getByText('Converge All').click()

        await app.getByRole('combobox', { name: /Continue when criteria/i }).selectOption('any')

        const requiredPathCountInput = app.getByRole('spinbutton', {
          name: /Required number of branches before continuing/i,
        })
        await expect(requiredPathCountInput).toBeVisible()
        await expect(requiredPathCountInput).toHaveValue('1')

        await requiredPathCountInput.fill('2')
        await app.getByRole('button', { name: 'Save and close' }).click()

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'PATCH'
        )
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        const payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, { strategy: 'any', n_required: 2 })
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })

    test('Round-trip persistence of "any" strategy configuration', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithAnyStrategy(app, 'Converge Any Persist', 5)

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'POST'
        )
        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        const payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, { strategy: 'any', n_required: 5 })

        await expect(app).toHaveURL(/workflow-builder\/.+/)
        await openWorkflowInBuilder(app, wfName)

        await app.getByText('Converge Any Persist').click()
        await expect(app.getByRole('combobox', { name: /Continue when criteria/i })).toHaveValue('any')
        await expect(
          app.getByRole('spinbutton', { name: /Required number of branches before continuing/i })
        ).toHaveValue('5')
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })
  })

  test.describe('Timeout configuration', () => {
    test('Enable timeout and configure units', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithTimeout(app, 'Converge Timeout', {
          seconds: 30,
          minutes: 5,
          hours: 2,
          days: 1,
          action: 'fail',
        })

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'POST'
        )
        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        // 30 + (5*60) + (2*3600) + (1*86400) = 93930
        const payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, {
          strategy: 'all',
          timeout: 93930,
          on_timeout: 'fail',
        })
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })

    test('Edit existing converge node with timeout', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithTimeout(app, 'Converge Timeout', {
          minutes: 5,
          action: 'continue',
        })

        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        await expect(app).toHaveURL(/workflow-builder\/.+/)

        await openWorkflowInBuilder(app, wfName)
        await app.getByText('Converge Timeout').click()

        await expect(app.getByRole('switch', { name: /Timeout/i })).toBeChecked()
        await expect(app.getByLabel(/Minute\(s\)/i)).toHaveValue('5')
        await expect(app.getByLabel(/Second\(s\)/i)).toHaveValue('0')
        await expect(app.getByLabel(/Hour\(s\)/i)).toHaveValue('0')
        await expect(app.getByLabel(/Day\(s\)/i)).toHaveValue('0')

        const actionButton = app.getByRole('button', { name: /Continue with partial data/i })
        await expect(actionButton).toBeVisible()
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })

    test('Timeout action options', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithTimeout(app, 'Converge Timeout Action', {
          minutes: 10,
          action: 'fail',
        })

        let saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'POST'
        )
        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        let saveRequest = await saveRequestPromise

        let payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, {
          strategy: 'all',
          timeout: 600,
          on_timeout: 'fail',
        })

        await expect(app).toHaveURL(/workflow-builder\/.+/)
        await openWorkflowInBuilder(app, wfName)

        await app.getByText('Converge Timeout Action').click()

        const actionButton = app.getByRole('button', { name: /Fail/i })
        await expect(actionButton).toBeVisible()
        await actionButton.click()

        const continueOption = app.getByRole('option', { name: 'Continue with partial data' })
        await expect(continueOption).toBeVisible()

        await expect(
          app.getByText(/The workflow will continue ignoring the parameters set for this converge step/i)
        ).toBeVisible()

        await continueOption.click()
        await app.getByRole('button', { name: 'Save and close' }).click()

        saveRequestPromise = app.waitForRequest((req) => req.url().includes('/workflows') && req.method() === 'PATCH')
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        saveRequest = await saveRequestPromise

        payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, {
          strategy: 'all',
          timeout: 600,
          on_timeout: 'continue',
        })
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })

    test('Complex timeout values round-trip correctly', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithTimeout(app, 'Converge Complex Timeout', {
          seconds: 45,
          minutes: 30,
          hours: 12,
          days: 2,
          action: 'continue',
        })

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'POST'
        )
        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        // 45 + (30*60) + (12*3600) + (2*86400) = 217845
        const payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, {
          strategy: 'all',
          timeout: 217845,
          on_timeout: 'continue',
        })

        await expect(app).toHaveURL(/workflow-builder\/.+/)
        await openWorkflowInBuilder(app, wfName)

        await app.getByText('Converge Complex Timeout').click()

        await expect(app.getByLabel(/Second\(s\)/i)).toHaveValue('45')
        await expect(app.getByLabel(/Minute\(s\)/i)).toHaveValue('30')
        await expect(app.getByLabel(/Hour\(s\)/i)).toHaveValue('12')
        await expect(app.getByLabel(/Day\(s\)/i)).toHaveValue('2')
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })

    test('Timeout with "any" strategy', async ({ app }) => {
      const wfName = await createWorkflowWithBranchesForConverge(app)

      try {
        await addConvergeNodeWithTimeout(app, 'Converge Any Timeout', {
          minutes: 20,
          action: 'continue',
          strategy: 'any',
          requiredPathCount: 2,
        })

        const saveRequestPromise = app.waitForRequest(
          (req) => req.url().includes('/workflows') && req.method() === 'POST'
        )
        await selectProjectIfRequired(app)
        await app.getByPlaceholder('Workflow name').fill(wfName)
        await app.getByRole('button', { name: 'Save', exact: true }).click()
        const saveRequest = await saveRequestPromise

        const payload = getWorkflowPayload(saveRequest)
        expectConvergeNodeConfig(payload.workflow_definition.nodes, {
          strategy: 'any',
          n_required: 2,
          timeout: 1200,
          on_timeout: 'continue',
        })
      } finally {
        await deleteWorkflow(app, wfName)
      }
    })
  })
})
