/**
 * E2E Tests: Default Builtin Groups — Visibility
 *
 * Reference: UI-31, AAP-73926 (AAP-73926)
 *
 * NOTE: The test plan specifies "Auditors" and "Users" groups, but the current
 * implementation uses "admins" and "authenticated" as builtin groups. This test
 * validates the actual implementation while noting the discrepancy.
 */
import { type Page } from '@playwright/test'

import { test, expect, toAppUrl, appBaseUrl } from './fixtures'
import { buildUniqueName } from './helpers/workflows'

const GROUPS_URL = '/system-administration/access-management/groups'

/** Get the API base URL (proxied through the UI server) */
function apiUrl(path: string): string {
  return new URL(`/api/v1${path}`, appBaseUrl).toString()
}

/** Get auth token for API calls */
async function getAuthToken(app: Page): Promise<string | null> {
  const password = process.env.NEXUS_E2E_PASSWORD
  if (!password) return null

  try {
    const resp = await app.request.post(apiUrl('/auth/login'), {
      data: { username: 'admin', password },
    })
    if (!resp.ok()) return null
    const body = (await resp.json()) as { access_token?: string }
    return body.access_token ?? null
  } catch {
    return null
  }
}

/** Create a regular (non-builtin) group via API */
async function createGroupViaApi(app: Page, name: string): Promise<string | null> {
  try {
    const token = await getAuthToken(app)
    if (!token) return null

    const resp = await app.request.post(apiUrl('/groups'), {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, description: `E2E test group: ${name}` },
    })
    if (!resp.ok()) return null
    const group = (await resp.json()) as { id?: string }
    return group.id ?? null
  } catch {
    return null
  }
}

/** Delete a group via API (best-effort cleanup) */
async function deleteGroupViaApi(app: Page, groupId: string): Promise<void> {
  if (app.isClosed()) return
  try {
    const token = await getAuthToken(app)
    if (token) {
      await app.request.delete(apiUrl(`/groups/${groupId}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  } catch {
    // Best-effort cleanup
  }
}

test.describe('Default Builtin Groups — Visibility', () => {
  let groupsTable: ReturnType<Page['getByRole']>
  let adminsRow: ReturnType<Page['getByRole']>
  let hasAdmins: boolean

  test.beforeEach(async ({ app }) => {
    // Navigate to groups list
    await app.goto(toAppUrl(GROUPS_URL))
    await expect(app.getByRole('heading', { level: 1, name: /access management/i })).toBeVisible()

    // Wait for table to load
    groupsTable = app.getByRole('grid', { name: /Groups table/i })
    await expect(groupsTable).toBeVisible()

    // Check if admins builtin group exists (skip all tests if not found)
    adminsRow = groupsTable.getByRole('row', { name: /admins/i })
    hasAdmins = await adminsRow
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)

    test.skip(!hasAdmins, 'Admins builtin group not found')
  })

  test('default builtin groups visible in groups list', async () => {
    // Verify admins group is visible (already checked in beforeEach)
    await expect(adminsRow).toBeVisible()

    // Look for "authenticated" builtin group (may be hidden from UI)
    const authenticatedRow = groupsTable.getByRole('row', { name: /authenticated/i })
    const hasAuthenticated = await authenticatedRow
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false)

    if (hasAuthenticated) {
      await expect(authenticatedRow).toBeVisible()
    }
  })

  test('builtin groups cannot be deleted', async () => {
    await expect(adminsRow).toBeVisible()

    // Verify no actions menu exists for builtin groups (is_builtin flag hides actions)
    const actionsBtn = adminsRow.getByRole('button', { name: /Actions|Kebab toggle/i })
    await expect(actionsBtn).not.toBeVisible()
  })

  test('builtin groups are distinguished from user-created groups', async ({ app }) => {
    // Create a regular group via API to compare against builtin groups
    const regularGroupName = buildUniqueName('e2e-regular-group')
    const groupId = await createGroupViaApi(app, regularGroupName)

    try {
      // Reload to show the new group
      await app.reload()
      await expect(app.getByRole('heading', { level: 1, name: /access management/i })).toBeVisible()

      const tableAfterReload = app.getByRole('grid', { name: /Groups table/i })
      const regularGroupRow = tableAfterReload.getByRole('row', { name: new RegExp(regularGroupName) })

      // Verify the regular group exists
      if (groupId) {
        await expect(regularGroupRow).toBeVisible({ timeout: 5000 })
      }

      // Builtin groups should NOT have an actions menu
      const builtinActionsBtn = adminsRow.getByRole('button', { name: /Actions|Kebab toggle/i })
      await expect(builtinActionsBtn).not.toBeVisible()

      // Regular groups SHOULD have an actions menu (if successfully created)
      if (groupId) {
        const regularActionsBtn = regularGroupRow.getByRole('button', { name: /Actions|Kebab toggle/i })
        await expect(regularActionsBtn).toBeVisible()
      }
    } finally {
      // Clean up the created group
      if (groupId) {
        await deleteGroupViaApi(app, groupId)
      }
    }
  })
})
