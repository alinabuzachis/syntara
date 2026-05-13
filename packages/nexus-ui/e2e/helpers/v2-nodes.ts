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

import { expect } from '../fixtures'

import { addNodePanel, closeNodeEditorPanel, fillCodeEditor } from './workflows'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Click "Add connected step" button on an edge and wait for the add-node panel to appear. */
async function openAddNodePanel(page: Page) {
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

/** Add a converge node (v2 type: "converge"). */
export async function addConvergeNode(page: Page, name: string) {
  await openAddNodePanel(page)
  await selectCategoryAndType(page, 'Logic', 'Converge')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)
}
