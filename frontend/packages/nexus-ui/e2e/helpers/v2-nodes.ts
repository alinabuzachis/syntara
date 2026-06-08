/**
 * Helper functions for adding each v2 workflow node type via the builder UI.
 *
 * V2 node types:
 *   Trigger:      manual, webhook
 *   Executors:    script, http_request, agentic, aap_job_template, approval
 *   Control flow: condition, loop, converge
 *
 * Each helper opens the add-node panel, selects the correct category/type,
 * fills the minimum required form fields, submits, and closes the editor.
 */

import { type Page } from '@playwright/test'

import { expect, toAppUrl } from '../fixtures'

import { addNodePanel, buildUniqueName, closeNodeEditorPanel, fillCodeEditor } from './workflows'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Select a category then a subtype within the add-node panel. */
async function selectCategoryAndType(page: Page, category: string, subtype: string) {
  const panel = addNodePanel(page)
  await panel.getByRole('button', { name: category, exact: true }).click()
  const subtypeBtn = panel.getByRole('button', { name: subtype, exact: true })
  await expect(subtypeBtn).toBeVisible({ timeout: 5_000 })
  await subtypeBtn.click()
}

/** Select a direct (non-category) button in the add-node panel. */
async function selectDirectNodeType(page: Page, label: string | RegExp) {
  const panel = addNodePanel(page)
  await panel.getByRole('button', { name: label }).click()
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

/** Click "Add connected step" button on an edge and wait for the add-node panel to appear. */
export async function openAddNodePanel(page: Page) {
  const layoutButton = page.getByRole('button', { name: 'Layout' })
  if ((await layoutButton.count()) > 0) {
    await layoutButton.click()
  }

  const addBtn = page.getByRole('button', { name: 'Add connected step' })
  await expect(addBtn.first()).toBeVisible({ timeout: 10_000 })

  // Retry clicking — React Flow edge buttons can be briefly detached during layout animations
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await addBtn.first().click({ force: true, timeout: 5_000 })
      await expect(addNodePanel(page)).toHaveCount(1, { timeout: 5_000 })
      return
    } catch {
      if (attempt === 2) throw new Error('Failed to open add-node panel after 3 attempts')
      await layoutButton.click()
      await expect(addBtn.first()).toBeVisible({ timeout: 5_000 })
    }
  }
}

/** Add a manual trigger. Must be called on a fresh /workflow-builder/new page. */
export async function addManualTrigger(page: Page, name = 'Manual trigger') {
  // Wait for page to finish loading
  await expect(page.getByRole('progressbar', { name: 'Loading' })).not.toBeVisible({ timeout: 15000 })

  // Wait for trigger selection panel with correct heading text
  await expect(page.getByRole('heading', { name: /select a trigger step/i })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Manual trigger' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByRole('button', { name: 'Save and close' }).click()

  // Panel auto-closes after adding trigger - no manual close needed
}

/** Add a webhook (API) trigger. Must be called on a fresh /workflow-builder/new page. */
export async function addWebhookTrigger(page: Page, name: string, webhookPath: string) {
  // Wait for page to finish loading
  await expect(page.getByRole('progressbar', { name: 'Loading' })).not.toBeVisible({ timeout: 15000 })

  // Wait for trigger selection panel with correct heading text
  await expect(page.getByRole('heading', { name: /select a trigger step/i })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Webhook trigger', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByRole('textbox', { name: 'Webhook path' }).fill(webhookPath)
  await page.getByRole('button', { name: 'Save and close' }).click()

  // Panel auto-closes after adding trigger - no manual close needed
}

// ---------------------------------------------------------------------------
// Executor nodes
// ---------------------------------------------------------------------------

/** Add a script node (v2 type: "script"). */
export async function addScriptNode(page: Page, name: string, code = 'print("hello")') {
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Action', 'Script')
  const nameInput = page.getByRole('textbox', { name: 'Name', exact: true })
  await expect(nameInput).toBeVisible({ timeout: 10_000 })
  await expect(nameInput).toBeEditable({ timeout: 5_000 })
  await nameInput.fill(name)
  await fillCodeEditor(page, { value: code })
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/** Add an HTTP request node (v2 type: "http_request"). */
export async function addHttpRequestNode(page: Page, name: string, url = 'https://api.example.com/data') {
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Action', 'REST API')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByLabel('URL').fill(url)
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/** Add an AI agent node (v2 type: "agentic"). */
export async function addAgenticNode(page: Page, name: string, prompt = 'Analyze the data') {
  await openAddNodePanel(page)
  await selectDirectNodeType(page, 'AI Agent')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByLabel('Prompt').fill(prompt)
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/** Add an AAP job template node (v2 type: "aap_job_template"). */
export async function addAapNode(page: Page, name: string, jobTemplateId = '123') {
  await openAddNodePanel(page)
  await selectDirectNodeType(page, /AAP/i)
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByLabel('Job template ID').fill(jobTemplateId)
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/** Add an approval node (v2 type: "approval") without completing branches. */
export async function addApprovalNode(page: Page, name: string, approver = 'admin') {
  await openAddNodePanel(page)
  await selectDirectNodeType(page, 'Approval')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByLabel('Add approver').fill(approver)
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/**
 * Add an approval node with a script node on the "approved" branch.
 * This creates a valid workflow that can be saved.
 * The "rejected" branch is optional per validation rules.
 */
export async function addApprovalNodeWithBranch(page: Page, name: string, approver = 'admin') {
  await addApprovalNode(page, name, approver)

  // Add a node on the "approved" branch to satisfy validation
  // The "rejected" branch is optional

  // Wait for approval node to be fully rendered before interacting with its edges
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })

  // Click layout to position nodes and make button edges visible
  const layoutButton = page.getByRole('button', { name: 'Layout' })
  if ((await layoutButton.count()) > 0) {
    await layoutButton.click()
  }

  // The approval node creates TWO button edges (to placeholders):
  // 1. One with data-testid="add-node-button-approved"
  // 2. One with data-testid="add-node-button-rejected"
  //
  // We need to click the "approved" button to add a node on the approved branch.

  const approvedButton = page.getByTestId('add-node-button-approved')
  await expect(approvedButton).toBeVisible({ timeout: 5000 })
  await approvedButton.click({ force: true })

  await expect(addNodePanel(page)).toHaveCount(1)

  await selectCategoryAndType(page, 'Action', 'Script')

  // Wait for the form to be fully loaded before filling
  const nameInput = page.getByRole('textbox', { name: 'Name', exact: true })
  await expect(nameInput).toBeVisible({ timeout: 10000 })
  await expect(nameInput).toBeEditable({ timeout: 5000 })

  await nameInput.fill(`${name} - approved action`)
  await fillCodeEditor(page, { value: 'print("approved")' })
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

// ---------------------------------------------------------------------------
// Control flow nodes
// ---------------------------------------------------------------------------

/** Add a condition node (v2 type: "condition") without completing branches. */
export async function addConditionNode(page: Page, name: string, expression = 'true') {
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Logic', 'Conditional')

  // Wait for the form to load
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)

  // Expression builder has two modes: visual builder or raw expression
  // Switch to raw mode to fill the expression directly
  const editorModeSelect = page.getByLabel(/Expression editor mode/i)
  await expect(editorModeSelect).toBeVisible()
  await editorModeSelect.selectOption('raw')

  // Wait for raw expression input to appear
  const rawExpressionInput = page.getByLabel(/Raw expression/i)
  await expect(rawExpressionInput).toBeVisible()
  await rawExpressionInput.fill(expression)

  // Click minimize button to close and save
  const closeButton = page.getByRole('button', { name: 'Save and close' })
  await expect(closeButton).toBeVisible()
  await closeButton.click()

  await closeNodeEditorPanel(page)
}

/**
 * Add a condition node with a script node on the "true" branch.
 * This creates a valid workflow that can be saved.
 * The "false" branch is optional per validation rules.
 */
export async function addConditionNodeWithBranch(page: Page, name: string, expression = 'true') {
  await addConditionNode(page, name, expression)

  // Add a node on the "true" branch to satisfy validation
  // The "false" branch is optional
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Action', 'Script')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`${name} - true action`)
  await fillCodeEditor(page, { value: 'print("condition is true")' })
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/** Add a loop node (v2 type: "loop") without completing the loop body. Defaults to "For each" loop. */
export async function addLoopNode(page: Page, name: string, items = '${trigger.items}') {
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Logic', 'Loop')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  // Ensure "For each" is selected (it may or may not be the default)
  const typeSelect = page.locator('#loop-type')
  if (await typeSelect.isVisible().catch(() => false)) {
    await typeSelect.selectOption({ label: 'For each' })
  }
  // Fill items expression
  const itemsInput = page.locator('#loop-items')
  if (await itemsInput.isVisible().catch(() => false)) {
    await itemsInput.fill(items)
  }
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/**
 * Add a loop node with a script node in the loop body.
 * This creates a valid workflow that can be saved.
 */
export async function addLoopNodeWithBody(page: Page, name: string, items = '${trigger.items}') {
  await addLoopNode(page, name, items)

  // Add a node in the loop body to satisfy validation
  // Use the "Add connected step" button on the edge
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Action', 'Script')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`${name} - loop body`)
  await fillCodeEditor(page, { value: 'print("processing item")' })
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/**
 * Navigate to a new workflow, add trigger + condition, and open the converge form.
 * Used by validation-only tests that don't need to save the workflow.
 */
export async function openConvergeFormOnNewWorkflow(page: Page) {
  await page.goto(toAppUrl('/workflow-builder/new'))
  await addManualTrigger(page, 'Manual trigger')
  await addConditionNodeWithBranch(page, 'Condition', 'true')
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Logic', 'Converge')
}

/** Add a converge node (v2 type: "converge"). */
export async function addConvergeNode(page: Page, name: string) {
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Logic', 'Converge')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/**
 * Add a converge node with 'all' strategy (wait for all branches).
 * V2 type: "converge", strategy: "all"
 */
export async function addConvergeNodeWithAllStrategy(page: Page, name: string) {
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Logic', 'Converge')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  // Strategy defaults to 'all', so no need to change it
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/**
 * Add a converge node with 'any' strategy (wait for N of M branches).
 * V2 type: "converge", strategy: "any", requiredPathCount: number
 */
export async function addConvergeNodeWithAnyStrategy(page: Page, name: string, requiredPathCount: number) {
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Logic', 'Converge')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)

  // Select 'any' strategy
  await page.getByRole('combobox', { name: /Continue when criteria/i }).selectOption('any')

  // Fill required path count
  const requiredPathCountInput = page.getByRole('spinbutton', {
    name: /Required number of branches before continuing/i,
  })
  await expect(requiredPathCountInput).toBeVisible()
  await requiredPathCountInput.fill(String(requiredPathCount))

  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/**
 * Add a converge node with timeout configuration.
 * V2 type: "converge", timeout: number (seconds), onTimeout: "fail" | "continue"
 */
export async function addConvergeNodeWithTimeout(
  page: Page,
  name: string,
  timeoutConfig: {
    seconds?: number
    minutes?: number
    hours?: number
    days?: number
    action: 'fail' | 'continue'
    strategy?: 'all' | 'any'
    requiredPathCount?: number
  }
) {
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Logic', 'Converge')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)

  // Set strategy if provided
  if (timeoutConfig.strategy === 'any' && timeoutConfig.requiredPathCount !== undefined) {
    await page.getByRole('combobox', { name: /Continue when criteria/i }).selectOption('any')
    const requiredPathCountInput = page.getByRole('spinbutton', {
      name: /Required number of branches before continuing/i,
    })
    await expect(requiredPathCountInput).toBeVisible()
    await requiredPathCountInput.fill(String(timeoutConfig.requiredPathCount))
  }

  // Enable timeout
  await page.getByRole('switch', { name: /Timeout/i }).click({ force: true })

  // Fill timeout units
  if (timeoutConfig.seconds !== undefined) {
    await page.getByLabel(/Second\(s\)/i).fill(String(timeoutConfig.seconds))
  }
  if (timeoutConfig.minutes !== undefined) {
    await page.getByLabel(/Minute\(s\)/i).fill(String(timeoutConfig.minutes))
  }
  if (timeoutConfig.hours !== undefined) {
    await page.getByLabel(/Hour\(s\)/i).fill(String(timeoutConfig.hours))
  }
  if (timeoutConfig.days !== undefined) {
    await page.getByLabel(/Day\(s\)/i).fill(String(timeoutConfig.days))
  }

  // Select timeout action
  // The timeout action is a PatternFly Select component with custom toggle
  const timeoutActionButton = page.getByRole('button', { name: /Fail|Continue with partial data/i })
  await expect(timeoutActionButton).toBeVisible()
  await timeoutActionButton.click()

  const actionOption =
    timeoutConfig.action === 'fail'
      ? page.getByRole('option', { name: 'Fail' })
      : page.getByRole('option', { name: 'Continue with partial data' })
  await expect(actionOption).toBeVisible()
  await actionOption.click()

  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}

/**
 * Create a workflow with trigger and condition node (2 branches), ready for converge node testing.
 * Returns the unique workflow name.
 */
export async function createWorkflowWithBranchesForConverge(page: Page): Promise<string> {
  const workflowName = buildUniqueName('converge-test')

  // Start on /workflow-builder/new
  await page.goto(toAppUrl('/workflow-builder/new'))

  // Add manual trigger
  await addManualTrigger(page, 'Manual trigger')

  // Add condition node with branch (creates 2 branches: true and false)
  await addConditionNodeWithBranch(page, 'Condition', 'true')

  return workflowName
}

/**
 * Verify converge node configuration in saved V2 workflow payload.
 * Uses snake_case field names as they appear in the API payload.
 */
export function expectConvergeNodeConfig(
  nodes: Array<{ id: string; type: string; config: Record<string, unknown> }>,
  expected: {
    strategy: 'all' | 'any'
    n_required?: number
    timeout?: number
    on_timeout?: 'fail' | 'continue'
  }
) {
  const convergeNode = nodes.find((n) => n.type === 'converge')
  expect(convergeNode).toBeDefined()
  expect(convergeNode?.config.strategy).toBe(expected.strategy)

  if (expected.n_required !== undefined) {
    expect(convergeNode?.config.n_required).toBe(expected.n_required)
  } else {
    expect(convergeNode?.config.n_required).toBeUndefined()
  }

  if (expected.timeout !== undefined) {
    expect(convergeNode?.config.timeout).toBe(expected.timeout)
  } else {
    expect(convergeNode?.config.timeout).toBeUndefined()
  }

  if (expected.on_timeout !== undefined) {
    expect(convergeNode?.config.on_timeout).toBe(expected.on_timeout)
  } else {
    expect(convergeNode?.config.on_timeout).toBeUndefined()
  }
}
