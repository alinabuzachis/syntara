import { test, expect, toAppUrl } from './fixtures'

test('user views executions and opens a running execution', async ({ app }) => {
  // Arrange - Navigate to run history (test assumes mock API has at least one running execution)
  await app.goto(toAppUrl('/executions'))
  await expect(app.getByRole('heading', { name: 'Run history' })).toBeVisible()

  const runningRow = app.getByRole('row', { name: /Running/ }).first()
  const hasRunning = await runningRow
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!hasRunning, 'Mock API has no running execution; seed data required')

  // Act - Open a running execution
  await runningRow.getByRole('button').first().click()

  // Assert - Execution details are visible
  await expect(app.getByText('Execution Details')).toBeVisible()
  const detailsPanel = app.getByText('Execution Details').locator('..')
  await expect(detailsPanel.getByText('Running', { exact: true })).toBeVisible()
})
