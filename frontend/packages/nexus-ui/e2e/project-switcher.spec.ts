/**
 * E2E Tests: Project Switcher — built-in project visibility @pr-check
 *
 * Critical paths covered:
 * - The project selector on the Workflows page lists the built-in project
 *   alongside user-created projects (regression for is_builtin filter removal)
 */

import { test, expect, toAppUrl } from './fixtures'

test.describe('Project switcher @pr-check', () => {
  test('built-in project is listed in the project selector on the Workflows page @pr-check', async ({ app }) => {
    await app.goto(toAppUrl('/workflows'))

    // Open the project selector (aria-label set on the typeahead input inside the toggle)
    const projectInput = app.getByLabel('Project')
    await expect(projectInput).toBeVisible({ timeout: 15_000 })
    await projectInput.click()

    // The built-in project must appear as an option in the open dropdown
    await expect(app.getByRole('option', { name: 'built-in' })).toBeVisible({ timeout: 5_000 })
  })
})
