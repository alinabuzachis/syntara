import { test, expect, toAppUrl } from './fixtures'
import {
  addNodePanel,
  buildUniqueName,
  closeNodeEditorPanel,
  createBasicWorkflow,
  fillCodeEditor,
} from './helpers/workflows'

test('user creates and saves a multi-node workflow', async ({ app }) => {
  // Arrange - Start a new workflow
  const workflowName = buildUniqueName('e2e-multi-node')
  await app.goto(toAppUrl('/automation-builder/new'))
  await expect(app.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

  // Act - Add manual trigger
  await app.getByRole('button', { name: 'Manual trigger' }).click()
  await app.getByLabel('Name').fill('Manual trigger')
  await app.getByRole('button', { name: /^Add step$/ }).click()

  // Act - Add connected action node
  await expect(app.getByRole('button', { name: 'Add connected step' })).toBeVisible()
  await app.getByRole('button', { name: 'Add connected step' }).click({ force: true })
  const firstPanel = addNodePanel(app)
  await expect(firstPanel).toHaveCount(1)
  await firstPanel.getByRole('button', { name: 'Action', exact: true }).click()
  await firstPanel.getByRole('button', { name: 'Script', exact: true }).click()
  await app.getByLabel('Name').fill('Send email')
  await fillCodeEditor(app, { value: 'print("hello from Playwright")' })
  await app.getByRole('button', { name: /^Add step$/ }).click()
  await closeNodeEditorPanel(app)

  // Act - Add another connected action node
  await expect(app.getByRole('button', { name: 'Add connected step' })).toBeVisible()
  await app.getByRole('button', { name: 'Add connected step' }).click({ force: true })
  const secondPanel = addNodePanel(app)
  await expect(secondPanel).toHaveCount(1)
  await secondPanel.getByRole('button', { name: 'Action', exact: true }).click()
  await secondPanel.getByRole('button', { name: 'Script', exact: true }).click()
  await app.getByLabel('Name').fill('Follow-up action')
  await fillCodeEditor(app, { value: 'print("follow-up")' })
  await app.getByRole('button', { name: /^Add step$/ }).click()

  // Act - Save workflow
  await app.getByPlaceholder('Workflow name').fill(workflowName)
  await app.getByRole('button', { name: 'Save' }).click()

  // Assert - Workflow is persisted in automations list
  await expect(app).toHaveURL(/automation-builder\/.+/)
  await app.goto(toAppUrl('/automations'))
  await app.getByPlaceholder('Filter by name').fill(workflowName)
  await app.getByRole('button', { name: 'Apply filter' }).click()
  await expect(app.getByRole('button', { name: workflowName, exact: true })).toBeVisible()
})

test('user edits an existing workflow and changes persist', async ({ app }) => {
  // Arrange - Create a workflow to edit
  const workflowName = buildUniqueName('e2e-edit')
  await createBasicWorkflow(app, workflowName, 'Initial task')

  // Act - Open workflow from automations list
  await app.goto(toAppUrl('/automations'))
  await app.getByPlaceholder('Filter by name').fill(workflowName)
  await app.getByRole('button', { name: 'Apply filter' }).click()
  await app.getByRole('button', { name: workflowName, exact: true }).click()

  const updatedName = `${workflowName}-updated`
  await app.getByPlaceholder('Workflow name').fill(updatedName)
  await app.getByRole('button', { name: 'Save' }).click()

  // Assert - Updated name persists
  await app.goto(toAppUrl('/automations'))
  await app.getByPlaceholder('Filter by name').fill(updatedName)
  await app.getByRole('button', { name: 'Apply filter' }).click()
  await expect(app.getByRole('button', { name: updatedName, exact: true })).toBeVisible()
})
