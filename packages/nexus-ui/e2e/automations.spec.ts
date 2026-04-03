import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName, createBasicWorkflow } from './helpers/workflows'

test('user searches, views, and deletes an automation', async ({ app }) => {
  // Arrange - Create a workflow to manage
  const workflowName = buildUniqueName('e2e-automation')
  const otherWorkflowName = buildUniqueName('e2e-automation-control')

  try {
    await createBasicWorkflow(app, workflowName, 'Manage automation')
    await createBasicWorkflow(app, otherWorkflowName, 'Control automation')
    // Act - Filter for the target automation by its unique suffix
    await app.goto(toAppUrl('/automations'))
    const searchTerm = workflowName.slice(-6)
    await app.getByPlaceholder('Filter by name').fill(searchTerm)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const targetRow = app.getByRole('row', { name: new RegExp(workflowName) })
    await expect(targetRow).toBeVisible()

    // Act - View details via the automation button
    await targetRow.getByRole('button', { name: workflowName }).click()

    // Assert - Builder shows the expected workflow
    await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName)

    // Act - Delete the automation from the list
    await app.goto(toAppUrl('/automations'))
    await app.getByPlaceholder('Filter by name').fill(searchTerm)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const deleteRow = app.getByRole('row', { name: new RegExp(workflowName) })
    await expect(deleteRow).toBeVisible()
    await deleteRow
      .getByRole('button', { name: /Actions|Kebab toggle/i })
      .first()
      .click({ force: true })
    await app.getByRole('menuitem', { name: 'Delete automation' }).click()
    await app.getByRole('button', { name: 'Delete' }).click()

    // Assert - Automation no longer appears
    await app.getByPlaceholder('Filter by name').fill(workflowName)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    await expect(app.getByRole('row', { name: new RegExp(workflowName) })).toHaveCount(0)
  } finally {
    for (const name of [otherWorkflowName, workflowName]) {
      await app.goto(toAppUrl('/automations'))
      await app.getByPlaceholder('Filter by name').fill(name)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      const row = app.getByRole('row', { name: new RegExp(name) })
      if ((await row.count()) > 0) {
        await row
          .getByRole('button', { name: /Actions|Kebab toggle/i })
          .first()
          .click({ force: true })
        await app.getByRole('menuitem', { name: 'Delete automation' }).click()
        await app.getByRole('button', { name: 'Delete' }).click()
      }
    }
  }
})
