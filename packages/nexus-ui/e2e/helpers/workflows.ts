import { randomUUID } from 'node:crypto'

import { type Page } from '@playwright/test'

import { expect, toAppUrl } from '../fixtures'

export const buildUniqueName = (prefix: string) => `${prefix}-${Date.now()}-${randomUUID()}`

export const addNodePanel = (page: Page) =>
  page.getByRole('region', {
    name: /add step|select a step|select an action step|select a trigger step/i,
  })

/**
 * Click "Layout" to position nodes and reveal edge buttons,
 * then click "Add connected step" and return the add-node panel.
 */
export async function clickAddConnectedStep(page: Page) {
  const layoutButton = page.getByRole('button', { name: 'Layout' }).first()
  await expect(layoutButton).toBeVisible({ timeout: 10000 })
  await layoutButton.click()

  const addBtn = page.getByRole('button', { name: 'Add connected step' })
  await expect(addBtn.first()).toBeVisible({ timeout: 10000 })
  await addBtn.first().click({ force: true })
  const panel = addNodePanel(page)
  await expect(panel).toHaveCount(1)
  return panel
}

export async function closeNodeEditorPanel(page: Page) {
  const closeButton = page.getByRole('button', { name: 'Close' })
  if ((await closeButton.count()) > 0) {
    await closeButton.first().click()
    await expect(closeButton).toHaveCount(0)
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
 * Select a project in the builder toolbar.
 * Required for new workflows on the real backend (Save is disabled without a project).
 * Falls back silently when the project selector is absent (e.g. mock API).
 */
export async function selectProjectIfRequired(page: Page, projectName = 'default') {
  const toggle = page.getByRole('button', { name: /Select a project/i })
  if ((await toggle.count()) > 0 && (await toggle.isVisible())) {
    await toggle.click()
    await page.getByRole('option', { name: projectName }).click()
  }
}

/** Delete a workflow from the workflows list by its unique name. */
export async function deleteWorkflow(page: Page, workflowName: string) {
  await page.goto(toAppUrl('/workflows'))
  await page.getByPlaceholder('Filter by name').fill(workflowName)
  await page.getByRole('button', { name: 'Apply filter' }).click()
  const row = page.getByRole('row', { name: new RegExp(workflowName) })
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
  }
}

/** Open a saved workflow in the builder by filtering the workflows list. */
export async function openWorkflowInBuilder(page: Page, workflowName: string) {
  await page.goto(toAppUrl('/workflows'))
  await page.getByPlaceholder('Filter by name').fill(workflowName)
  await page.getByRole('button', { name: 'Apply filter' }).click()
  await page.getByRole('button', { name: workflowName, exact: true }).click()
  await expect(page.getByPlaceholder('Workflow name')).toHaveValue(workflowName)
}

export async function createBasicWorkflow(page: Page, workflowName: string, actionName: string) {
  // Arrange - Start from the new workflow builder
  await page.goto(toAppUrl('/workflow-builder/new'))
  await expect(page.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

  // Act - Add manual trigger
  await page.getByRole('button', { name: 'Manual trigger' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual trigger')
  await page.getByRole('button', { name: /^Add step$/ }).click()

  // Act - Add a connected action node
  const panel = await clickAddConnectedStep(page)
  await panel.getByRole('button', { name: 'Action', exact: true }).click()
  await panel.getByRole('button', { name: 'Script', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(actionName)
  await fillCodeEditor(page, { value: 'print("hello")' })
  await page.getByRole('button', { name: /^Add step$/ }).click()
  await closeNodeEditorPanel(page)

  // Act - Select project first (required on real backend), then name and save
  await selectProjectIfRequired(page)
  await page.getByPlaceholder('Workflow name').fill(workflowName)
  await page.getByRole('button', { name: 'Save' }).click()

  // Assert - Workflow created and navigated to edit route
  await expect(page).toHaveURL(/workflow-builder\/.+/)
}
