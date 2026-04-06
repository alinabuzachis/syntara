import { expect, type Page } from '@playwright/test'

import { toAppUrl } from '../fixtures'

export const buildUniqueName = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const addNodePanel = (page: Page) =>
  page.getByRole('region', {
    name: /add step|select a step|select an action step|select a trigger step/i,
  })

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
      const editor = (window as Record<string, unknown>).monaco
        ? (
            (window as Record<string, unknown>).monaco as {
              editor: { getEditors: () => Array<{ setValue: (v: string) => void }> }
            }
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

export async function createBasicWorkflow(page: Page, workflowName: string, actionName: string) {
  // Arrange - Start from the new workflow builder
  await page.goto(toAppUrl('/automation-builder/new'))
  await expect(page.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

  // Act - Add manual trigger
  await page.getByRole('button', { name: 'Manual trigger' }).click()
  await page.getByLabel('Name').fill('Manual trigger')
  await page.getByRole('button', { name: /^Add step$/ }).click()

  // Act - Add a connected action node
  await expect(page.getByRole('button', { name: 'Add connected step' })).toBeVisible()
  await page.getByRole('button', { name: 'Add connected step' }).click({ force: true })
  const panel = addNodePanel(page)
  await expect(panel).toHaveCount(1)
  await panel.getByRole('button', { name: 'Action', exact: true }).click()
  await panel.getByRole('button', { name: 'Script', exact: true }).click()
  await page.getByLabel('Name').fill(actionName)
  await fillCodeEditor(page, { value: 'print("hello")' })
  await page.getByRole('button', { name: /^Add step$/ }).click()
  await closeNodeEditorPanel(page)

  // Act - Name and save workflow
  await page.getByPlaceholder('Workflow name').fill(workflowName)
  await page.getByRole('button', { name: 'Save' }).click()

  // Assert - Workflow created and navigated to edit route
  await expect(page).toHaveURL(/automation-builder\/.+/)
}
