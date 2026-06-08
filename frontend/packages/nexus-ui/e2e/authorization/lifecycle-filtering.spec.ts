/**
 * E2E Tests: Lifecycle & Filtering (AAP-76534)
 *
 * Tests verifying that real permission differences control
 * page-level accessibility for different personas.
 *
 * TC-1.10: Admin persona sees workflows page content. Restricted persona
 *          (no workflow permissions) does not.
 * TC-1.11: Admin persona sees Settings page content. Restricted persona
 *          (no setting:read) sees access-denied empty state instead.
 */
import { test } from '../fixtures'
import { buildUniqueName } from '../helpers/workflows'

import { expect, createAdminPersona, createPersona, cleanupPersona, loginAsUser, toAppUrl } from './fixtures'

test.describe('AAP-76534: Lifecycle & Filtering', () => {
  test('TC-1.10: admin persona sees workflows; restricted persona does not', async ({ app, browser }) => {
    const admin = await createAdminPersona(app, buildUniqueName('admin'))
    const restricted = await createPersona(app, buildUniqueName('restricted'), ['project:read'])

    const adminCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()

    try {
      await loginAsUser(adminPage, admin)
      await adminPage.goto(toAppUrl('/workflows'))
      await expect(adminPage.getByRole('heading', { level: 1, name: /Workflows/i })).toBeVisible({ timeout: 15_000 })
    } finally {
      await adminCtx.close()
    }

    const restrictedCtx = await browser.newContext()
    const restrictedPage = await restrictedCtx.newPage()

    try {
      await loginAsUser(restrictedPage, restricted)
      await restrictedPage.goto(toAppUrl('/workflows'))
      await expect(restrictedPage.getByRole('heading', { level: 1, name: /Workflows/i })).not.toBeVisible({
        timeout: 2_000,
      })
    } finally {
      await restrictedCtx.close()
      await cleanupPersona(app, restricted)
      await cleanupPersona(app, admin)
    }
  })

  test('TC-1.11: admin persona sees Settings page; restricted persona does not', async ({ app, browser }) => {
    const admin = await createAdminPersona(app, buildUniqueName('admin'))
    const restricted = await createPersona(app, buildUniqueName('no-settings'), ['workflow:read', 'project:read'])

    const adminCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()

    try {
      await loginAsUser(adminPage, admin)
      await adminPage.goto(toAppUrl('/system-administration/settings'))
      await expect(adminPage.getByRole('heading', { level: 1, name: /Settings/i })).toBeVisible({ timeout: 15_000 })
    } finally {
      await adminCtx.close()
    }

    const restrictedCtx = await browser.newContext()
    const restrictedPage = await restrictedCtx.newPage()

    try {
      await loginAsUser(restrictedPage, restricted)
      await restrictedPage.goto(toAppUrl('/system-administration/settings'))
      await expect(restrictedPage.getByRole('heading', { level: 1, name: /Settings/i })).not.toBeVisible({
        timeout: 2_000,
      })
    } finally {
      await restrictedCtx.close()
      await cleanupPersona(app, restricted)
      await cleanupPersona(app, admin)
    }
  })
})
