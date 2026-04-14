/**
 * E2E Tests: Group Membership Management (Drawer-based)
 *
 * Critical paths covered:
 * - Open group drawer by clicking a group row
 * - View group details and members tabs in the drawer
 * - Add a member to a group via the drawer
 * - Remove a member from a group via the drawer
 * - Close the drawer
 * - Manage group membership from user detail page
 */
import { test, expect, toAppUrl } from './fixtures'

test.describe('Group Membership — Drawer', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto(toAppUrl('/access-management/groups'))
    await expect(app.getByRole('heading', { level: 1, name: /access management/i })).toBeVisible()
  })

  test('clicking a group row opens the drawer with details', async ({ app }) => {
    // Click on a group row
    const row = app.getByRole('row', { name: /platform-admins/i })
    await expect(row).toBeVisible()
    await row.click()

    // Drawer should appear with group name and tabs
    await expect(app.getByRole('heading', { level: 2, name: 'platform-admins' })).toBeVisible()
    await expect(app.getByRole('tab', { name: /details/i })).toBeVisible()
    await expect(app.getByRole('tab', { name: /members/i })).toBeVisible()

    // Details tab content should be visible
    await expect(app.getByText('Full platform administrators')).toBeVisible()
  })

  test('switching to members tab shows member list', async ({ app }) => {
    // Open drawer for a group
    await app.getByRole('row', { name: /platform-admins/i }).click()
    await expect(app.getByRole('heading', { level: 2, name: 'platform-admins' })).toBeVisible()

    // Switch to members tab
    await app.getByRole('tab', { name: /members/i }).click()

    // Should see members content (table or empty state)
    const hasTable = await app
      .getByRole('columnheader', { name: 'Username' })
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    const hasEmptyState = await app
      .getByText('No members')
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false)

    expect(hasTable || hasEmptyState).toBe(true)
  })

  test('close drawer with close button', async ({ app }) => {
    // Open drawer
    await app.getByRole('row', { name: /platform-admins/i }).click()
    const drawerHeading = app.getByRole('heading', { level: 2, name: 'platform-admins' })
    await expect(drawerHeading).toBeVisible()

    // Close it
    await app.getByRole('button', { name: /close/i }).click()
    await expect(drawerHeading).not.toBeVisible()
  })

  test('add and remove a member from the drawer', async ({ app }) => {
    // Open drawer for the developers group
    await app.getByRole('row', { name: /developers/i }).click()
    await expect(app.getByRole('heading', { level: 2, name: 'developers' })).toBeVisible()

    // Switch to members tab
    await app.getByRole('tab', { name: /members/i }).click()

    // Click add member button
    await app.getByRole('button', { name: 'Add member' }).click()

    // Modal should appear
    await expect(app.getByRole('dialog')).toBeVisible()

    // Open the typeahead and pick the first option
    const selectToggle = app.getByRole('button', { name: /select a user/i })
    await selectToggle.click()
    const firstOption = app.getByRole('option').first()
    const userName = await firstOption.textContent()
    await firstOption.click()

    // Submit
    await app.getByRole('button', { name: 'Add', exact: true }).click()

    // Verify success
    await expect(app.getByText(/member added/i)).toBeVisible()

    // The new member should appear
    if (userName) {
      const memberName = userName.trim()
      await expect(app.getByRole('cell', { name: memberName })).toBeVisible({ timeout: 5000 })

      // Now remove the member
      const memberRow = app.getByRole('row').filter({ hasText: memberName })
      await memberRow.getByRole('button', { name: /actions/i }).click()
      await app.getByRole('menuitem', { name: 'Remove' }).click()

      // Confirm removal dialog
      await expect(app.getByRole('dialog')).toBeVisible()
      await app.getByRole('button', { name: 'Remove', exact: true }).click()

      // Verify success
      await expect(app.getByText(/member removed/i)).toBeVisible()
    }
  })

  test('selecting a different group updates the drawer', async ({ app }) => {
    // Open drawer for first group
    await app.getByRole('row', { name: /platform-admins/i }).click()
    await expect(app.getByRole('heading', { level: 2, name: 'platform-admins' })).toBeVisible()

    // Click a different group
    await app.getByRole('row', { name: /developers/i }).click()
    await expect(app.getByRole('heading', { level: 2, name: 'developers' })).toBeVisible()
  })

  test('builtin groups show built-in label and no edit button', async ({ app }) => {
    await app.getByRole('row', { name: /^admins/i }).click()
    await expect(app.getByRole('heading', { level: 2, name: 'admins' })).toBeVisible()

    // Should show Built-in label
    await expect(app.getByText('Built-in')).toBeVisible()

    // Should not show edit button in the drawer
    await expect(app.getByRole('button', { name: 'Edit group' })).not.toBeVisible()
  })
})

test.describe('User Detail — Group Membership', () => {
  test('add to group button is available on user groups tab', async ({ app }) => {
    await app.goto(toAppUrl('/access-management/users'))
    await expect(app.getByRole('heading', { level: 1, name: /access management/i })).toBeVisible()

    // Click on a user
    const userLink = app.getByRole('button', { name: 'admin', exact: true })
    const hasUser = await userLink
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasUser, 'No admin user in mock data')

    await userLink.click()

    // Navigate to groups tab
    await app.getByRole('tab', { name: /groups/i }).click()

    // Should see add to group button
    await expect(app.getByRole('button', { name: /add to group/i })).toBeVisible({ timeout: 5000 })
  })
})
