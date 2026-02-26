import { expect, type Page } from '@playwright/test'
import { toAppUrl } from '../fixtures'

export const buildUniqueName = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const addNodePanel = (page: Page) =>
  page.getByRole('region', {
    name: /add node|select a node|select an action node|select a trigger node/i,
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
    await expect(target).toBeVisible()
    await target.click({ force: true })
    await page.keyboard.insertText(value)
  }

  const roleEditor = page.getByRole('textbox', { name: label }).first()
  await typeInto(roleEditor)
}

export async function createBasicWorkflow(page: Page, workflowName: string, actionName: string) {
  // Arrange - Start from the new workflow builder
  await page.goto(toAppUrl('/automation-builder/new'))
  await expect(page.getByRole('heading', { name: 'Select a trigger node' })).toBeVisible()

  // Act - Add manual trigger
  await page.getByRole('button', { name: 'Manual trigger' }).click()
  await page.getByLabel('Name').fill('Manual trigger')
  await page.getByRole('button', { name: /^Add node$/ }).click()

  // Act - Add a connected action node
  await expect(page.getByRole('button', { name: 'Add connected node' })).toBeVisible()
  await page.getByRole('button', { name: 'Add connected node' }).click({ force: true })
  const panel = addNodePanel(page)
  await expect(panel).toHaveCount(1)
  await panel.getByRole('button', { name: 'Action', exact: true }).click()
  await panel.getByRole('button', { name: 'Script', exact: true }).click()
  await page.getByLabel('Name').fill(actionName)
  await fillCodeEditor(page, { value: 'print("hello")' })
  await page.getByRole('button', { name: /^Add node$/ }).click()
  await closeNodeEditorPanel(page)

  // Act - Name and save workflow
  await page.getByPlaceholder('Workflow name').fill(workflowName)
  await page.getByRole('button', { name: 'Save' }).click()

  // Assert - Workflow created toast
  await expect(page.getByText('Workflow created successfully')).toBeVisible()
}
