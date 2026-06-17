import { randomUUID } from 'node:crypto'

import { type Page } from '@playwright/test'

import { expect, toAppUrl } from '../fixtures'
import { ensureProject } from '../utils/api'

export const buildUniqueName = (prefix: string) => `${prefix}-${Date.now()}-${randomUUID()}`

export const addNodePanel = (page: Page) =>
  page.getByRole('region', {
    name: /add step|select a step|select an action step|select a trigger step|select a logic step|select an aap execution step/i,
  })

/**
 * Wait for UI to be ready by ensuring no toast notifications or loading overlays are blocking interactions
 */
export async function waitForUIReady(page: Page) {
  // Wait for any toast notifications to disappear
  const toasts = page.locator('.pf-v6-c-alert-group, .pf-v6-c-alert')
  await toasts
    .first()
    .waitFor({ state: 'hidden', timeout: 5000 })
    .catch(() => {
      // No toasts present, that's fine
    })

  // Wait for loading states to clear
  const loadingStates = page.getByLabel('Loading')
  await loadingStates
    .first()
    .waitFor({ state: 'hidden', timeout: 10000 })
    .catch(() => {
      // No loading states, that's fine
    })
}

/**
 * Click "Layout" to position nodes and reveal edge buttons,
 * then click "Add connected step" and return the add-node panel.
 */
export async function clickAddConnectedStep(page: Page) {
  // Wait for any toast notifications or loading states to clear
  await waitForUIReady(page)

  const layoutButton = page.getByRole('button', { name: 'Layout' }).first()
  await expect(layoutButton).toBeVisible({ timeout: 10000 })
  await layoutButton.click()

  // Wait again after layout completes
  await waitForUIReady(page)

  // Wait for canvas to finish re-rendering after layout and "Add connected step" buttons to appear
  await expect(async () => {
    const addBtn = page.getByRole('button', { name: 'Add connected step' })
    await expect(addBtn.first()).toBeVisible()
  }).toPass({ timeout: 10000, intervals: [500] })

  const addBtn = page.getByRole('button', { name: 'Add connected step' })
  await addBtn.first().click()

  const panel = addNodePanel(page)
  await expect(panel).toHaveCount(1)

  // Wait for panel to be fully loaded and stable
  await expect(async () => {
    const firstCategoryBtn = panel.getByRole('button', { name: 'Action', exact: true })
    await expect(firstCategoryBtn).toBeVisible()
    await expect(firstCategoryBtn).toBeEnabled()
  }).toPass({ timeout: 15000, intervals: [500, 1000] })

  return panel
}

export async function closeNodeEditorPanel(page: Page) {
  const closeButton = page.getByRole('button', { name: 'Close' })
  if ((await closeButton.count()) > 0) {
    await expect(closeButton.first()).toBeVisible({ timeout: 5000 })
    await closeButton.first().click()
    await expect(closeButton).toHaveCount(0, { timeout: 10000 })
  }
}

export async function fillCodeEditor(
  page: Page,
  { value, label = 'Script code editor' }: { value: string; label?: string }
) {
  const typeInto = async (target: ReturnType<Page['locator']>) => {
    const textbox = target.getByRole('textbox', { name: label }).first()
    if (await textbox.isVisible()) {
      await textbox.click({ force: true })
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.type(value, { delay: 10 })
      await expect(textbox).toHaveValue(value)
      return
    }

    const monacoSurface = target.locator('.monaco-editor').first()
    await expect(monacoSurface).toBeVisible({ timeout: 5000 })
    await monacoSurface.click({ force: true })
    const usedMonacoApi = await page.evaluate((text) => {
      const w = window as unknown as Record<string, unknown>
      const editor = w.monaco
        ? (
            w.monaco as { editor: { getEditors: () => Array<{ setValue: (v: string) => void }> } }
          ).editor.getEditors()[0]
        : null
      if (editor) {
        editor.setValue(text)
        return true
      }
      const el = document.querySelector('.monaco-editor')
      if (el) {
        const textarea = el.querySelector('textarea')
        if (textarea) {
          textarea.focus()
          document.execCommand('selectAll')
          document.execCommand('insertText', false, text)
        }
      }
      return false
    }, value)
    if (!usedMonacoApi) {
      await expect(monacoSurface.locator('.view-lines')).toContainText(value.slice(0, 20), {
        timeout: 5000,
      })
    }
  }

  // Wait for at least one editor variant to appear
  await expect(async () => {
    const inlineCount = await page.getByTestId('inline-code-editor').locator(':visible').count()
    const modalCount = await page.getByTestId('modal-code-editor').locator(':visible').count()
    const roleCount = await page.getByRole('textbox', { name: label }).count()

    if (inlineCount === 0 && modalCount === 0 && roleCount === 0) {
      throw new Error('No code editor found')
    }
  }).toPass({ timeout: 15000, intervals: [500, 1000] })

  const visibleInlineEditor = page.getByTestId('inline-code-editor').locator(':visible').first()
  if ((await visibleInlineEditor.count()) > 0) {
    await typeInto(visibleInlineEditor)
    return
  }

  const visibleModalEditor = page.getByTestId('modal-code-editor').locator(':visible').first()
  if ((await visibleModalEditor.count()) > 0) {
    await typeInto(visibleModalEditor)
    return
  }

  const roleEditor = page.getByRole('textbox', { name: label }).first()
  await expect(roleEditor).toBeVisible()
  await roleEditor.click({ force: true })
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(value, { delay: 10 })
  await expect(roleEditor).toHaveValue(value)
}

/**
 * Select the first available project from a typeahead project selector dropdown.
 * Works on both mock API (where projects are available immediately) and real backend
 * (where project names vary). Skips "All projects" and "Create project" options.
 */
export async function selectFirstProject(page: Page) {
  const projectInput = page.getByPlaceholder(/All projects|Select a project/)
  const hasInput = await projectInput
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (!hasInput) return

  await projectInput.click()
  await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 10_000 })

  // Retry until a real project option appears — API-loaded options arrive after
  // static ones ("All projects", "Create project") on slower CI backends.
  await clickFirstRealProjectOption(page)
}

/**
 * Select a project in the builder toolbar.
 * Required for new workflows on the real backend (Save is disabled without a project).
 * Falls back silently when the project selector is absent (e.g. mock API).
 */
export async function selectProjectIfRequired(page: Page, projectName?: string) {
  const projectInput = page.getByPlaceholder(/Select a project/)
  const needsSelection = await projectInput
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (!needsSelection) return

  // The placeholder is briefly "Select a project" before the Zustand store
  // restores a previously selected project and re-renders the toggle.
  // Re-check that the locator still matches; if it vanished, a project is
  // already selected and no action is needed.
  if ((await projectInput.count()) === 0) return

  await projectInput.click()
  await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 10_000 })

  if (projectName) {
    const option = page.getByRole('option', { name: projectName })
    await option.waitFor({ state: 'visible', timeout: 15_000 })
    await option.click()
  } else {
    await clickFirstRealProjectOption(page)
  }
}

async function clickFirstRealProjectOption(page: Page) {
  // First try: wait for an API-loaded project to appear
  const found = await trySelectRealProject(page)
  if (found) return

  // No real projects exist — create one via the "Create project" UI option
  await createProjectViaDropdown(page)
}

async function trySelectRealProject(page: Page): Promise<boolean> {
  try {
    await expect(async () => {
      const options = page.getByRole('option')
      if ((await options.count()) === 0) {
        const toggle = page.getByPlaceholder(/All projects|Select a project/)
        if ((await toggle.count()) > 0) await toggle.click()
        await options.first().waitFor({ state: 'visible', timeout: 3_000 })
      }

      const count = await options.count()
      for (let i = 0; i < count; i++) {
        const text = await options.nth(i).textContent()
        if (text && !text.includes('All projects') && !text.includes('Create project')) {
          await options.nth(i).click()
          return
        }
      }
      throw new Error('No real project options yet')
    }).toPass({ timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

async function createProjectViaDropdown(page: Page) {
  const options = page.getByRole('option')
  if ((await options.count()) === 0) {
    const toggle = page.getByPlaceholder(/All projects|Select a project/)
    if ((await toggle.count()) > 0) await toggle.click()
    await options.first().waitFor({ state: 'visible', timeout: 5_000 })
  }

  await page.getByRole('option', { name: 'Create project' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Project name' }).fill('default')
  await dialog.getByRole('button', { name: 'Create project' }).click()

  // Wait for dialog to close (project created) or for a success toast
  await expect(dialog).not.toBeVisible({ timeout: 15_000 })
}

/** Delete a workflow from the workflows list by its unique name. */
export async function deleteWorkflow(page: Page, workflowName: string) {
  if (page.isClosed()) return
  try {
    await page.goto(toAppUrl('/workflows'))
    await page.getByPlaceholder('Filter by name').fill(workflowName)
    await page.getByRole('button', { name: 'Apply filter' }).click()

    const table = page.getByRole('grid', { name: 'Workflows table' })
    const row = table.getByRole('row', { name: new RegExp(workflowName) })
    const isVisible = await expect(row.first())
      .toBeVisible()
      .then(() => true)
      .catch(() => false)
    if (isVisible) {
      await row
        .getByRole('button', { name: /Actions|Kebab toggle/i })
        .first()
        .click({ force: true })
      await page.getByRole('menuitem', { name: 'Delete workflow' }).click()
      await page.getByRole('checkbox', { name: /I understand this workflow/i }).check()
      await page.getByRole('button', { name: 'Delete' }).click()

      // Wait for deletion to complete - row should disappear
      await expect(row.first())
        .not.toBeVisible({ timeout: 10000 })
        .catch(() => {
          // If row doesn't disappear, at least wait for dialog to close
        })
    }
  } catch {
    // Best-effort cleanup — don't fail the test
  }
}

/** Open a saved workflow in the builder by filtering the workflows list. */
export async function openWorkflowInBuilder(page: Page, workflowName: string) {
  await page.goto(toAppUrl('/workflows'))
  await page.getByPlaceholder('Filter by name').fill(workflowName)
  await page.getByRole('button', { name: 'Apply filter' }).click()

  const table = page.getByRole('grid', { name: 'Workflows table' })
  const row = table.getByRole('row', { name: new RegExp(workflowName) })
  await row.getByRole('button', { name: workflowName, exact: true }).click()
  await expect(page.getByPlaceholder('Workflow name')).toHaveValue(workflowName)
}

export async function createBasicWorkflow(page: Page, workflowName: string, actionName: string) {
  // Ensure a project exists before entering the builder (CI starts with empty DB)
  await ensureProject(page)

  await page.goto(toAppUrl('/workflow-builder/new'))
  await expect(page.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

  // Add manual trigger
  await page.getByRole('button', { name: 'Manual trigger' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual trigger')
  await page.getByRole('button', { name: 'Save and close' }).click()

  // Add a connected action node
  const panel = await clickAddConnectedStep(page)
  await panel.getByRole('button', { name: 'Action', exact: true }).click()
  await panel.getByRole('button', { name: 'Script', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(actionName)
  await fillCodeEditor(page, { value: 'print("hello")' })
  await page.getByRole('button', { name: 'Save and close' }).click()
  await closeNodeEditorPanel(page)

  // Select project (required on real backend), then name and save
  await selectProjectIfRequired(page)
  await page.getByPlaceholder('Workflow name').fill(workflowName)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/workflow-builder\/.+/)
}

/**
 * Start a new workflow with a manual trigger.
 * Returns after the trigger is added and the editor panel is closed.
 */
export async function startWorkflowWithTrigger(page: Page) {
  await ensureProject(page)
  await page.goto(toAppUrl('/workflow-builder/new'))
  await expect(page.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

  await selectProjectIfRequired(page)

  await page.getByRole('button', { name: 'Manual trigger' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual trigger')
  await page.getByRole('button', { name: 'Save and close' }).click()
}

/** Save the workflow with the given name. Waits for URL to confirm persistence. */
export async function saveWorkflow(page: Page, workflowName: string) {
  await selectProjectIfRequired(page)
  await page.getByPlaceholder('Workflow name').fill(workflowName)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/workflow-builder\/.+/)
}

/**
 * Create a basic workflow with only a manual trigger.
 * Saves the workflow and waits for it to be persisted.
 * Canvas is ready after this function returns.
 */
export async function createWorkflowWithTrigger(page: Page, workflowName: string) {
  // Ensure a project exists before entering the builder (CI starts with empty DB)
  await ensureProject(page)

  await page.goto(toAppUrl('/workflow-builder/new'))
  await expect(page.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

  await page.getByRole('button', { name: 'Manual trigger' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual trigger')
  await page.getByRole('button', { name: 'Save and close' }).click()

  await selectProjectIfRequired(page)
  const nameInput = page.getByPlaceholder('Workflow name')
  await nameInput.clear()
  await nameInput.fill(workflowName)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/workflow-builder\/.+/, { timeout: 15000 })

  await expect(page.getByText('Manual trigger')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Layout' })).toBeVisible()

  // Wait for canvas to be fully ready
  await waitForUIReady(page)
}

/**
 * Add a Script action node to the workflow canvas.
 */
export async function addScriptNode(page: Page, name: string, code: string) {
  const panel = await clickAddConnectedStep(page)

  const actionBtn = panel.getByRole('button', { name: 'Action', exact: true })
  await expect(actionBtn).toBeVisible({ timeout: 10000 })
  await expect(actionBtn).toBeEnabled({ timeout: 5000 })
  await actionBtn.click()

  // Wait for panel to transition and show action types
  const actionHeading = panel.getByRole('heading', { name: /select an action step/i })
  await expect(actionHeading).toBeVisible({ timeout: 10000 })

  // Wait for panel re-render to complete before clicking Script
  await expect(async () => {
    const scriptBtn = panel.getByRole('button', { name: 'Script', exact: true })
    await expect(scriptBtn).toBeVisible()
    await expect(scriptBtn).toBeEnabled()
  }).toPass({ timeout: 15000, intervals: [500, 1000] })

  const scriptBtn = panel.getByRole('button', { name: 'Script', exact: true })
  await scriptBtn.click()

  await expect(actionHeading).not.toBeVisible({ timeout: 10000 })

  // Wait for form to load and be stable
  await expect(async () => {
    const nameInput = page.getByRole('textbox', { name: 'Name', exact: true })
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toBeEditable()
  }).toPass({ timeout: 20000, intervals: [500, 1000] })

  const nameInput = page.getByRole('textbox', { name: 'Name', exact: true })
  await nameInput.fill(name)

  // Wait for form to be fully loaded before filling code editor
  await waitForUIReady(page)

  await fillCodeEditor(page, { value: code })

  const saveButton = page.getByRole('button', { name: 'Save and close' })
  await expect(saveButton).toBeEnabled({ timeout: 20000 })
  await saveButton.click()

  // Wait for the Script form to close — AddNodePanel unmounts immediately when Script
  // is selected so panel.toHaveCount(0) passes instantly and is not a useful gate.
  // Waiting for the Save button to leave the DOM is the real signal that the form unmounted.
  await expect(page.getByRole('button', { name: 'Save and close' })).not.toBeAttached({ timeout: 15000 })

  // Wait for UI to stabilize
  await waitForUIReady(page)

  // Wait for node to appear on canvas using accessible ARIA attributes
  await expect(page.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: name })).toBeVisible({
    timeout: 10000,
  })
}

/**
 * Add a Script action node WITHOUT auto-connecting it (uses "Add step" instead of "Add connected step").
 * Useful for testing manual edge creation.
 */
export async function addScriptNodeUnconnected(page: Page, name: string, code: string) {
  // Click "Add step" button (not "Add connected step")
  const addStepBtn = page.getByRole('button', { name: 'Add step' }).first()
  await addStepBtn.click()

  const panel = addNodePanel(page)

  const actionBtn = panel.getByRole('button', { name: 'Action', exact: true })
  await expect(actionBtn).toBeVisible({ timeout: 10000 })
  await expect(actionBtn).toBeEnabled({ timeout: 5000 })
  await actionBtn.click()

  // Wait for panel to transition to action types
  await expect(async () => {
    const scriptBtn = panel.getByRole('button', { name: 'Script', exact: true })
    await expect(scriptBtn).toBeVisible()
    await expect(scriptBtn).toBeEnabled()
  }).toPass({ timeout: 15000, intervals: [500, 1000] })

  const scriptBtn = panel.getByRole('button', { name: 'Script', exact: true })
  await scriptBtn.click()

  // Wait for form to load and be stable
  await expect(async () => {
    const nameInput = page.getByRole('textbox', { name: 'Name', exact: true })
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toBeEditable()
  }).toPass({ timeout: 20000, intervals: [500, 1000] })

  const nameInput = page.getByRole('textbox', { name: 'Name', exact: true })
  await nameInput.fill(name)

  // Wait for form to be fully loaded before filling code editor
  await waitForUIReady(page)

  await fillCodeEditor(page, { value: code })

  const saveButton = page.getByRole('button', { name: 'Save and close' })
  await expect(saveButton).toBeEnabled({ timeout: 20000 })
  await saveButton.click()

  // Wait for panel to close
  await expect(panel).toHaveCount(0, { timeout: 15000 })

  // Wait for UI to stabilize
  await waitForUIReady(page)

  // Wait for canvas to render the new node using accessible ARIA attributes
  await expect(page.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: name })).toBeVisible({
    timeout: 10000,
  })
}

/**
 * Verify that a node with the given name is visible on the canvas.
 */
export async function verifyNodeVisible(page: Page, nodeName: string) {
  // ReactFlow nodes have role="group" with aria-roledescription="node"
  await expect(page.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: nodeName })).toBeVisible({
    timeout: 10000,
  })
}

/**
 * Navigate to the workflow builder and add an API action node form
 * where the credential selector is visible and enabled.
 */
export async function navigateToApiActionForm(page: Page) {
  await ensureProject(page)
  await page.goto(toAppUrl('/workflow-builder/new'))
  await expect(page.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

  await selectProjectIfRequired(page)

  await page.getByRole('button', { name: 'Manual trigger' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual trigger')
  await page.getByRole('button', { name: 'Save and close' }).click()

  const credentialsLoaded = page.waitForResponse((resp) => resp.url().includes('/credentials') && resp.status() === 200)
  const panel = await clickAddConnectedStep(page)
  await panel.getByRole('button', { name: 'Action', exact: true }).click()
  await panel.getByRole('button', { name: 'REST API', exact: true }).click()

  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
  await credentialsLoaded
  const credToggle = page.getByRole('button', { name: 'Authentication credential', exact: true })
  await expect(credToggle).toBeEnabled({ timeout: 10_000 })
}
