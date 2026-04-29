import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName, createBasicWorkflow, deleteWorkflow } from './helpers/workflows'

test('user searches, views, and deletes a workflow', async ({ app }) => {
  test.setTimeout(90_000)
  // Arrange - Create a workflow to manage
  const workflowName = buildUniqueName('e2e-workflow')
  const otherWorkflowName = buildUniqueName('e2e-workflow-control')

  try {
    await createBasicWorkflow(app, workflowName, 'Manage workflow')
    await createBasicWorkflow(app, otherWorkflowName, 'Control workflow')
    // Act - Filter for the target workflow by its unique suffix
    await app.goto(toAppUrl('/workflows'))
    const searchTerm = workflowName.slice(-6)
    await app.getByPlaceholder('Filter by name').fill(searchTerm)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const targetRow = app.getByRole('row', { name: new RegExp(workflowName) })
    await expect(targetRow).toBeVisible()

    // Act - View details via the workflow button
    await targetRow.getByRole('button', { name: workflowName }).click()

    // Assert - Builder shows the expected workflow
    await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName)

    // Act - Delete the workflow from the list
    await app.goto(toAppUrl('/workflows'))
    await app.getByPlaceholder('Filter by name').fill(searchTerm)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const deleteRow = app.getByRole('row', { name: new RegExp(workflowName) })
    await expect(deleteRow).toBeVisible()
    await deleteRow
      .getByRole('button', { name: /Actions|Kebab toggle/i })
      .first()
      .click({ force: true })
    await app.getByRole('menuitem', { name: 'Delete workflow' }).click()
    await app.getByRole('checkbox', { name: /I understand this workflow/i }).check()
    await app.getByRole('button', { name: 'Delete' }).click()

    // Assert - Workflow no longer appears
    await app.getByPlaceholder('Filter by name').fill(workflowName)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    await expect(app.getByRole('row', { name: new RegExp(workflowName) })).toHaveCount(0)
  } finally {
    for (const name of [otherWorkflowName, workflowName]) {
      await deleteWorkflow(app, name)
    }
  }
})
