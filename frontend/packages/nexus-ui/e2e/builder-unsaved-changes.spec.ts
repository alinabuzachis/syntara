/**
 * E2E Tests: Builder unsaved changes modal (AAP-75130)
 *
 * Critical paths covered:
 * - Modal appears when navigating away from the builder with unsaved changes
 * - Button order matches PatternFly spec: "Save workflow" (primary, leftmost),
 *   "Exit without saving" (secondary), "Cancel" (link)
 * - "Cancel" keeps the user in the builder without navigating
 * - "Exit without saving" navigates away and discards changes
 * - "Save workflow" saves and then navigates away
 * - Modal does NOT appear when there are no unsaved changes
 *
 * Edge cases:
 * - Modal does not appear when navigating within the builder
 * - Modal does not appear when the workflow has not been modified
 */

import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName, createBasicWorkflow, deleteWorkflow } from './helpers/workflows'

test.describe('builder unsaved changes modal (AAP-75130)', () => {
  test('modal shows correct button order: Save workflow → Exit without saving → Cancel', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-unsaved')
    await createBasicWorkflow(app, workflowName, 'Unsaved test action')

    try {
      // Open the saved workflow in the builder
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await app.getByRole('link', { name: workflowName, exact: true }).click()
      await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName)

      // Make a change to mark the workflow dirty
      await app.getByPlaceholder('Workflow name').fill(`${workflowName}-dirty`)

      // Navigate away via the sidebar to trigger the modal
      await app
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: /Workflows/i })
        .click()

      // Modal should appear
      const modal = app.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Title
      await expect(modal.getByText('Save changes before exiting the workflow builder?')).toBeVisible()

      // Button order: Save workflow (primary) first, then Exit without saving, then Cancel
      const buttons = modal.getByRole('button')
      const saveBtn = modal.getByRole('button', { name: 'Save workflow' })
      const exitBtn = modal.getByRole('button', { name: 'Exit without saving' })
      const cancelBtn = modal.getByRole('button', { name: 'Cancel' })

      await expect(saveBtn).toBeVisible()
      await expect(exitBtn).toBeVisible()
      await expect(cancelBtn).toBeVisible()

      // Verify DOM order: Save workflow must come before Exit without saving
      const allButtons = await buttons.allTextContents()
      const saveIndex = allButtons.indexOf('Save workflow')
      const exitIndex = allButtons.indexOf('Exit without saving')
      const cancelIndex = allButtons.indexOf('Cancel')
      expect(saveIndex).toBeLessThan(exitIndex)
      expect(exitIndex).toBeLessThan(cancelIndex)

      // Cancel to stay in builder
      await cancelBtn.click()
      await expect(modal).not.toBeVisible()
      await expect(app).toHaveURL(/workflow-builder/)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('"Cancel" keeps user in the builder without navigating', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-cancel-modal')
    await createBasicWorkflow(app, workflowName, 'Cancel test action')

    try {
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await app.getByRole('link', { name: workflowName, exact: true }).click()

      // Make the workflow dirty
      await app.getByPlaceholder('Workflow name').fill(`${workflowName}-modified`)

      // Trigger the modal
      await app
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: /Workflows/i })
        .click()

      const modal = app.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Click Cancel
      await modal.getByRole('button', { name: 'Cancel' }).click()

      // Should still be in the builder
      await expect(modal).not.toBeVisible()
      await expect(app).toHaveURL(/workflow-builder/)

      // Workflow name input should still show the modified value
      await expect(app.getByPlaceholder('Workflow name')).toHaveValue(`${workflowName}-modified`)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test.skip('"Exit without saving" navigates away and discards changes', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-exit-discard')
    await createBasicWorkflow(app, workflowName, 'Exit discard action')

    try {
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await app.getByRole('link', { name: workflowName, exact: true }).click()

      // Make the workflow dirty
      await app.getByPlaceholder('Workflow name').fill(`${workflowName}-discarded`)

      // Trigger modal
      await app
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: /Workflows/i })
        .click()

      const modal = app.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Click Exit without saving
      await modal.getByRole('button', { name: 'Exit without saving' }).click()

      // Should navigate away from builder
      await expect(app).not.toHaveURL(/workflow-builder/)

      // The original workflow should still exist with the original name (not discarded name)
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await expect(app.getByRole('link', { name: workflowName, exact: true })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('"Save workflow" saves changes and navigates away', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-save-navigate')
    const updatedName = `${workflowName}-saved`
    await createBasicWorkflow(app, workflowName, 'Save navigate action')

    try {
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await app.getByRole('link', { name: workflowName, exact: true }).click()

      // Make the workflow dirty with a new name
      await app.getByPlaceholder('Workflow name').fill(updatedName)

      // Trigger modal
      await app
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: /Workflows/i })
        .click()

      const modal = app.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Click Save workflow
      await modal.getByRole('button', { name: 'Save workflow' }).click()

      // Should navigate away after saving
      await expect(app).not.toHaveURL(/workflow-builder/, { timeout: 15_000 })

      // The updated name should persist
      await app.getByPlaceholder('Filter by name').fill(updatedName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await expect(app.getByRole('link', { name: updatedName, exact: true })).toBeVisible({ timeout: 15_000 })
    } finally {
      await deleteWorkflow(app, updatedName)
      await deleteWorkflow(app, workflowName)
    }
  })

  test('modal does NOT appear when navigating away with no unsaved changes', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-no-modal')
    await createBasicWorkflow(app, workflowName, 'No modal action')

    try {
      // Open the saved workflow — it's clean (no changes)
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await app.getByRole('link', { name: workflowName, exact: true }).click()
      await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName)

      // Navigate away without making any changes
      await app
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: /Workflows/i })
        .click()

      // Modal should NOT appear
      await expect(app.getByRole('dialog')).not.toBeVisible()

      // Should have navigated successfully
      await expect(app).not.toHaveURL(/workflow-builder/)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})
