/**
 * E2E Tests: Builder Save Validation — Project Required
 *
 * Critical paths covered:
 * - Saving a new workflow without a project keeps the user on /new and shows
 *   a danger state on the project selector (aria-invalid)
 * - Selecting a project then saving succeeds and navigates away from /new
 * - Save button is always clickable (never aria-disabled due to missing project)
 *
 * Note: Toast notifications are intentionally NOT asserted here — they are
 * tested in unit tests and are too ephemeral for reliable E2E assertions.
 * The project-validation tests are skipped when the Zustand store has already
 * restored a selected project (e.g. from a previous test in the same browser
 * session), because validation only fires on the no-project path.
 */

import { type Page } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName, selectProjectIfRequired } from './helpers/workflows'
import { ensureProject } from './utils/api'

/** Returns true if the "Select a project" placeholder is currently visible */
async function projectIsUnselected(app: Page) {
  return app
    .getByPlaceholder('Select a project')
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false)
}

test.describe('Builder save validation — project required', () => {
  /**
   * Core validation flow: save without project → danger state on selector →
   * select project → save succeeds and navigates away.
   */
  test.skip('saving new workflow without project shows error then succeeds after project selection', async ({
    app,
  }) => {
    const workflowName = buildUniqueName('e2e-proj-validation')
    await ensureProject(app)

    await app.goto(toAppUrl('/workflow-builder/new'))
    await expect(app.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

    // Add a trigger step
    await app.getByRole('button', { name: 'Manual trigger' }).click()
    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual trigger')
    await app.getByRole('button', { name: 'Create' }).click()

    // Skip when the Zustand store has already restored a selected project —
    // validation will not fire in that case and this test would be a false failure.
    if (!(await projectIsUnselected(app))) {
      test.skip()
      return
    }

    try {
      await app.getByPlaceholder('Workflow name').fill(workflowName)

      // Act: save without selecting a project
      await app.getByRole('button', { name: 'Save' }).click()

      // Assert: URL remains at /new (save was rejected)
      await expect(app).toHaveURL(/workflow-builder\/new/, { timeout: 5_000 })

      // Assert: project selector shows aria-invalid danger state
      await expect(app.locator('[aria-invalid="true"]')).toBeVisible()

      // Act: select a project
      const projectInput = app.getByRole('textbox', { name: 'Project' })
      await projectInput.click()
      await expect(app.getByRole('option').nth(0)).toBeVisible({ timeout: 10_000 })
      await app.getByRole('option').nth(0).click()

      // Assert: danger state is cleared
      await expect(app.locator('[aria-invalid="true"]')).not.toBeVisible()

      // Act: save again — should succeed
      await app.getByRole('button', { name: 'Save' }).click()

      // Assert: navigated away from /new to the persisted workflow URL
      await expect(app).toHaveURL(/workflow-builder\/(?!new)/, { timeout: 15_000 })
    } finally {
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      const row = app.getByRole('row', { name: new RegExp(workflowName) })
      if ((await row.count()) > 0) {
        await row.getByRole('button', { name: /Actions|Kebab toggle/i }).click({ force: true })
        await app.getByRole('menuitem', { name: 'Delete workflow' }).click()
        await app.getByRole('checkbox', { name: /I understand this workflow/i }).check()
        await app.getByRole('button', { name: 'Delete' }).click()
      }
    }
  })

  /**
   * Verify Save button is always clickable even when no project is selected.
   * The previous behaviour disabled the button; now validation fires on click.
   */
  test('Save button is clickable even without a project selected', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))
    await expect(app.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

    const saveButton = app.getByRole('button', { name: 'Save' })
    await expect(saveButton).toBeVisible()
    await expect(saveButton).not.toHaveAttribute('aria-disabled', 'true')
  })

  /**
   * Saving a new workflow with a project already selected navigates away from /new.
   */
  test('saving new workflow with project selected succeeds immediately', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-proj-save-ok')
    await ensureProject(app)

    await app.goto(toAppUrl('/workflow-builder/new'))
    await expect(app.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

    try {
      // Add a trigger step
      await app.getByRole('button', { name: 'Manual trigger' }).click()
      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual trigger')
      await app.getByRole('button', { name: 'Create' }).click()

      // Select a project if one isn't already selected from the Zustand store
      await selectProjectIfRequired(app)

      // Name and save
      await app.getByPlaceholder('Workflow name').fill(workflowName)
      await app.getByRole('button', { name: 'Save' }).click()

      // Assert: navigated away from /new — workflow was persisted
      await expect(app).toHaveURL(/workflow-builder\/(?!new)/, { timeout: 15_000 })
    } finally {
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      const row = app.getByRole('row', { name: new RegExp(workflowName) })
      if ((await row.count()) > 0) {
        await row.getByRole('button', { name: /Actions|Kebab toggle/i }).click({ force: true })
        await app.getByRole('menuitem', { name: 'Delete workflow' }).click()
        await app.getByRole('checkbox', { name: /I understand this workflow/i }).check()
        await app.getByRole('button', { name: 'Delete' }).click()
      }
    }
  })

  /**
   * Project required error fires even when the workflow already has steps.
   * Skipped when the Zustand store has already restored a project selection.
   */
  test('project required error fires even when workflow has steps', async ({ app }) => {
    await ensureProject(app)

    await app.goto(toAppUrl('/workflow-builder/new'))
    await expect(app.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()

    await app.getByRole('button', { name: 'Manual trigger' }).click()
    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual trigger')
    await app.getByRole('button', { name: 'Create' }).click()

    if (!(await projectIsUnselected(app))) {
      test.skip()
      return
    }

    // Click Save without selecting a project
    await app.getByRole('button', { name: 'Save' }).click()

    // Assert: URL remains at /new (save was blocked)
    await expect(app).toHaveURL(/workflow-builder\/new/, { timeout: 5_000 })

    // Assert: project selector is in danger/invalid state
    await expect(app.locator('[aria-invalid="true"]')).toBeVisible()
  })
})
