import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName, createBasicWorkflow } from './helpers/workflows'

test('user searches, views, and deletes an automation', async ({ app }) => {
  // Arrange - Create a workflow to manage
  const workflowName = buildUniqueName('e2e-automation')
  const otherWorkflowName = buildUniqueName('e2e-automation-control')
  await createBasicWorkflow(app, workflowName, 'Manage automation')
  await createBasicWorkflow(app, otherWorkflowName, 'Control automation')

  // Act - Search for the automation
  await app.goto(toAppUrl('/automations'))
  const searchTerm = workflowName.slice(-6)
  const targetRow = app.getByRole('row', { name: new RegExp(workflowName) })
  const controlRow = app.getByRole('row', { name: new RegExp(otherWorkflowName) })
  await expect(targetRow).toBeVisible()
  await expect(controlRow).toBeVisible()

  await app.getByPlaceholder('Search automations...').fill(searchTerm)
  await expect(app.getByPlaceholder('Search automations...')).toHaveValue(searchTerm)
  await expect(targetRow).toBeVisible()
  await expect(controlRow).toHaveCount(0)

  // Act - View details via the automation button
  await targetRow.getByRole('button', { name: workflowName }).click()

  // Assert - Builder shows the expected workflow
  await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName)

  // Act - Delete the automation from the list
  await app.goto(toAppUrl('/automations'))
  await app.getByPlaceholder('Search automations...').fill(searchTerm)
  const deleteRow = app.getByRole('row', { name: new RegExp(workflowName) })
  await deleteRow.getByRole('button', { name: 'Kebab toggle' }).click()
  await app.getByRole('menuitem', { name: 'Delete automation' }).click()
  await app.getByRole('button', { name: 'Delete' }).click()

  // Assert - Automation no longer appears
  await expect(app.getByText(`Successfully deleted automation "${workflowName}"`)).toBeVisible()
  await expect(app.getByRole('button', { name: workflowName })).toHaveCount(0)
})
