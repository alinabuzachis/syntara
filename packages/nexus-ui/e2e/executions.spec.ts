import { test, expect, toAppUrl } from './fixtures'

test('user views executions and opens a running execution', async ({ app }) => {
  test.skip(!!process.env.CI, 'CI deploys a fresh backend with no running executions to assert on')
  await app.goto(toAppUrl('/executions'))
  await expect(app.getByRole('heading', { name: 'Workflow Runs' })).toBeVisible()

  const executionsTable = app.getByRole('grid').filter({ has: app.getByRole('columnheader', { name: 'Status' }) })
  const runningRow = executionsTable
    .getByRole('row')
    .filter({ has: app.getByText(/Running/i) })
    .nth(0)
  const hasRunning = await runningRow
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!hasRunning, 'Mock API has no running execution; seed data required')

  const runDetailButton = runningRow.getByRole('button').filter({ has: app.locator('code') })
  await runDetailButton.click()
  await expect(app).toHaveURL((url) => /^\/executions\/[^/]+$/.test(new URL(url).pathname))
  await expect(app.getByRole('heading', { name: 'Current run details' })).toBeVisible()
})
