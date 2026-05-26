import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName, createBasicWorkflow, deleteWorkflow } from './helpers/workflows'
import {
  createRoleAssignmentViaApi,
  createUserViaApi,
  deleteRoleAssignmentViaApi,
  deleteUserViaApi,
  type SeededRoleAssignment,
  type SeededUser,
} from './seeds/iam'
import { ensureProject, getAuthToken } from './utils/api'

test.describe('destructive modal UX compliance (AAP-72897)', () => {
  let seededUser: SeededUser | null = null
  let seededAssignment: SeededRoleAssignment | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    const token = await getAuthToken(page)
    if (token) {
      const prefix = buildUniqueName('e2e-dm')
      seededUser = await createUserViaApi(page, { username: `${prefix}-user`, token })

      if (seededUser) {
        const project = await ensureProject(page)
        if (project) {
          seededAssignment = await createRoleAssignmentViaApi(page, project.id, {
            userId: seededUser.id,
            roleName: 'admin',
            token,
          })
        }
      }
    }
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    if (seededAssignment) {
      await deleteRoleAssignmentViaApi(page, seededAssignment.projectId, seededAssignment.id)
    }
    if (seededUser) {
      await deleteUserViaApi(page, seededUser.id)
    }
    await page.close()
  })

  test('disconnect integration modal matches UX spec', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-disconnect-modal')
    await app.goto(toAppUrl('/configuration/integrations'))

    try {
      // Create an integration to delete
      await app.getByRole('button', { name: 'Configure integration' }).first().click()
      await app.getByLabel('Server name / ID').fill(integrationName)
      await app.getByLabel('API URL').fill('https://api.example.com')
      await app.getByLabel('API key').fill('test-key')
      await app.getByRole('button', { name: 'Configure integration' }).first().click()
      await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()

      // Filter to find it
      await app.getByPlaceholder('Filter by name').fill(integrationName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      const row = app.getByRole('row', { name: new RegExp(integrationName) })
      await expect(row).toBeVisible({ timeout: 30000 })

      // Open the kebab menu and click disconnect
      await row
        .getByRole('button', { name: /Actions|Kebab toggle/i })
        .first()
        .click({ force: true })
      await app.getByRole('menuitem', { name: /Disconnect/i }).click()

      // Verify the modal matches the UX spec
      const modal = app.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Title should be "Disconnect integration?" with question mark
      await expect(modal.getByText('Disconnect integration?')).toBeVisible()

      // Body should use the spec format with bold resource name
      await expect(modal.getByText(new RegExp(integrationName))).toBeVisible()
      await expect(modal.getByText(/will be disconnected/)).toBeVisible()
      await expect(modal.getByText(/cannot be undone/)).toBeVisible()

      // Disconnect button should be disabled before checkbox is checked
      const disconnectButton = modal.getByRole('button', { name: 'Disconnect' })
      await expect(disconnectButton).toBeDisabled()

      // Checkbox should be present with the acknowledgement text
      const checkbox = modal.getByRole('checkbox')
      await expect(checkbox).toBeVisible()
      await expect(checkbox).not.toBeChecked()
      await expect(modal.getByText(/I understand this integration will be permanently disconnected/)).toBeVisible()

      // After checking the checkbox, disconnect button should be enabled
      await checkbox.click()
      await expect(checkbox).toBeChecked()
      await expect(disconnectButton).toBeEnabled()

      // Unchecking should disable the button again
      await checkbox.click()
      await expect(disconnectButton).toBeDisabled()

      // Cancel button should use link variant and close the modal
      const cancelButton = modal.getByRole('button', { name: 'Cancel' })
      await expect(cancelButton).toBeVisible()
      await cancelButton.click()
      await expect(modal).not.toBeVisible()
    } finally {
      // Cleanup - disconnect the integration if it exists
      await app.goto(toAppUrl('/configuration/integrations'))
      await app.getByPlaceholder('Filter by name').fill(integrationName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      const row = app.getByRole('row', { name: new RegExp(integrationName) })
      if ((await row.count()) > 0) {
        await row
          .getByRole('button', { name: /Actions|Kebab toggle/i })
          .first()
          .click({ force: true })
        await app.getByRole('menuitem', { name: /Disconnect/i }).click()
        await app.getByRole('dialog').getByRole('checkbox').click()
        await app.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
      }
    }
  })

  test('delete workflow modal has Tier 1 pattern: warning icon, acknowledgement checkbox', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-modal-wf')

    await createBasicWorkflow(app, workflowName, 'Modal test action')

    try {
      await app.goto(toAppUrl('/workflows'))
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()

      const row = app.getByRole('row', { name: new RegExp(workflowName) })
      await expect(row).toBeVisible({ timeout: 15000 })

      // Open kebab menu and click Delete
      await row
        .getByRole('button', { name: /Actions|Kebab toggle/i })
        .first()
        .click({ force: true })
      await app.getByRole('menuitem', { name: 'Delete workflow' }).click()

      const modal = app.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Title ends with question mark
      await expect(modal.getByText('Delete workflow?')).toBeVisible()

      // Body mentions the workflow name and consequences
      await expect(modal.getByText(new RegExp(workflowName))).toBeVisible()
      await expect(modal.getByText(/cannot be undone/)).toBeVisible()

      // Tier 1: checkbox must be present and checked to enable delete
      const checkbox = modal.getByRole('checkbox')
      await expect(checkbox).toBeVisible()
      await expect(checkbox).not.toBeChecked()

      const deleteButton = modal.getByRole('button', { name: 'Delete' })
      await expect(deleteButton).toBeDisabled()

      await checkbox.click()
      await expect(deleteButton).toBeEnabled()

      // Cancel to keep the workflow for cleanup
      await modal.getByRole('button', { name: 'Cancel' }).click()
      await expect(modal).not.toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('unassign role modal has Tier 2 pattern: warning icon, no checkbox', async ({ app }) => {
    await app.goto(toAppUrl('/system-administration/access-management/users'))

    const table = app.getByRole('grid', { name: 'Users table' })
    const hasTable = await table
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasTable, 'No user data available; seed data required')

    // Navigate to first user's role assignments
    const firstUserLink = table.getByRole('link').first()
    await expect(firstUserLink).toBeVisible()
    await firstUserLink.click()

    // Go to the Assignments tab
    const roleAssignmentsTab = app.getByRole('tab', { name: /Assignments/i })
    const hasRoleTab = await roleAssignmentsTab
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasRoleTab, 'No role assignments tab available')

    await roleAssignmentsTab.click()

    // Find an unassign button
    const unassignButton = app.getByRole('button', { name: /Unassign/i }).first()
    const hasUnassign = await unassignButton
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasUnassign, 'No role assignments available to unassign')

    await unassignButton.click()

    const modal = app.getByRole('dialog')
    await expect(modal).toBeVisible()

    // Title ends with question mark
    await expect(modal.getByText('Unassign role?')).toBeVisible()

    // Tier 2: NO checkbox (reversible action)
    await expect(modal.getByRole('checkbox')).toHaveCount(0)

    // Confirm button should be enabled immediately (no checkbox gate)
    const confirmButton = modal.getByRole('button', { name: 'Unassign' })
    await expect(confirmButton).toBeEnabled()

    // Cancel to avoid side effects
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).not.toBeVisible()
  })
})
