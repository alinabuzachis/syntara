import AxeBuilder from '@axe-core/playwright'
import { type Page } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
}

test.describe('Accessibility', () => {
  test('workflows page has no accessibility violations', async ({ app }) => {
    await app.goto(toAppUrl('/workflows'))
    await expect(app.getByText('Workflows', { exact: true }).first()).toBeVisible()

    await expectNoA11yViolations(app)
  })

  test('executions page has no accessibility violations', async ({ app }) => {
    await app.goto(toAppUrl('/executions'))
    await expect(app.getByText('Workflow Runs', { exact: true }).first()).toBeVisible()

    await expectNoA11yViolations(app)
  })

  test('approvals page has no accessibility violations', async ({ app }) => {
    await app.goto(toAppUrl('/approvals'))
    await expect(app.getByText('Approvals', { exact: true }).first()).toBeVisible()

    await expectNoA11yViolations(app)
  })

  test('audit log page has no accessibility violations', async ({ app }) => {
    await app.goto(toAppUrl('/system-administration/audit-log'))
    await expect(app.getByText('Audit Log', { exact: true }).first()).toBeVisible()

    await expectNoA11yViolations(app)
  })

  test('integrations page has no accessibility violations', async ({ app }) => {
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()

    await expectNoA11yViolations(app)
  })

  test('workflow builder page has no accessibility violations', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))
    await expect(app.getByPlaceholder('Workflow name')).toBeVisible()

    await expectNoA11yViolations(app)
  })
})
