/**
 * Tests UI-25 (Admin Attach Identity) and UI-26 (Admin Detach Identity)
 *
 * Critical paths covered:
 * - Two-step Attach Identity modal: select user -> select identity -> attach
 * - Detach (Disconnect) identity with confirmation dialog
 *
 * Uses Playwright route interception to mock API responses. No backend data is
 * created or modified; route intercepts are cleared automatically after each test.
 */
import { test, expect, toAppUrl } from './fixtures'
import {
  ACCESS_URL,
  NON_BUILTIN_USER_ID,
  FEDERATED_USER_ID,
  IDENTITY_ID_2,
  builtinUserResponse,
  nonBuiltinUserResponse,
  federatedUserIdentity,
  nonBuiltinUserIdentity,
  oneProviderResponse,
  usersListResponse,
  fulfill,
  mockUserIdentities,
  mockUser,
  mockAuthMe,
  mockAuthProviders,
  mockUsersList,
  mockUserGroups,
} from './utils/mockData'

test.describe('User Detail — Admin Identity Actions (UI-25, UI-26)', () => {
  /**
   * UI-25: Admin opens the Attach Identity modal, selects a source user,
   * picks one of their identities, and attaches it to the current user.
   */
  test('admin attaches a federated identity from another user (UI-25)', async ({ app }) => {
    // User A (Alice) identities — the source for the attach
    await mockUserIdentities(app, FEDERATED_USER_ID, {
      resources: [federatedUserIdentity],
    })

    // User B (jdoe) identities — stateful: empty before POST, populated after
    let identityAttached = false
    const movedIdentity = { ...federatedUserIdentity, user_id: NON_BUILTIN_USER_ID }
    await app.route(`**/api/v1/users/${NON_BUILTIN_USER_ID}/identities`, (route) => {
      if (route.request().method() === 'POST') {
        identityAttached = true
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(movedIdentity),
        })
      }
      return route.fulfill(fulfill({ resources: identityAttached ? [movedIdentity] : [] }))
    })

    await mockUserGroups(app, NON_BUILTIN_USER_ID)
    await mockUser(app, NON_BUILTIN_USER_ID, nonBuiltinUserResponse)
    await mockUsersList(app, usersListResponse)
    await mockAuthMe(app, builtinUserResponse)
    await mockAuthProviders(app, oneProviderResponse)

    await app.goto(toAppUrl(`${ACCESS_URL}/${NON_BUILTIN_USER_ID}/identities`))

    // Open the Attach Identity modal
    const attachButton = app.getByRole('button', { name: 'Attach identity' })
    await expect(attachButton).toBeVisible({ timeout: 15_000 })
    await attachButton.click()

    const dialog = app.getByRole('dialog', { name: 'Attach Identity' })
    await expect(dialog).toBeVisible()

    // Step 1: Select a user — click the email text to trigger row selection
    // (clicking the username link would navigate away due to stopPropagation)
    await expect(dialog.getByText('Step 1: Select a user')).toBeVisible()
    await dialog.getByText('asmith@nexus.local').click()

    // Step 2: Select an identity — click the Subject text to trigger row selection
    await expect(dialog.getByText('Step 2: Select an identity')).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Alice Smith' })).toBeVisible()
    await dialog.getByText('asmith@example.com').click()

    // Warning alert appears when both user and identity are selected
    await expect(dialog.getByText('This will move the identity to the current user.')).toBeVisible()

    // Click Attach
    await dialog.getByRole('button', { name: 'Attach' }).click()

    // Success alert and identity now appears in User B's table
    await expect(app.getByRole('heading', { name: 'Identity attached' })).toBeVisible({ timeout: 10_000 })
    await expect(app.getByRole('gridcell', { name: /Corporate SSO/ })).toBeVisible({ timeout: 10_000 })
  })

  /**
   * UI-26: Admin clicks Disconnect on a linked identity, confirms in the
   * confirmation dialog, and the identity is removed.
   */
  test('admin disconnects a linked identity (UI-26)', async ({ app }) => {
    let identityDetached = false

    // DELETE specific identity — registered before the broader GET route
    await app.route(`**/api/v1/users/${NON_BUILTIN_USER_ID}/identities/${IDENTITY_ID_2}`, (route) => {
      identityDetached = true
      return route.fulfill({ status: 204, body: '' })
    })

    // GET identities — starts with one, empty after detach
    await app.route(`**/api/v1/users/${NON_BUILTIN_USER_ID}/identities`, (route) =>
      route.fulfill(fulfill({ resources: identityDetached ? [] : [nonBuiltinUserIdentity] }))
    )

    await mockUserGroups(app, NON_BUILTIN_USER_ID)
    await mockUser(app, NON_BUILTIN_USER_ID, nonBuiltinUserResponse)
    await mockAuthMe(app, builtinUserResponse)
    await mockAuthProviders(app, oneProviderResponse)

    await app.goto(toAppUrl(`${ACCESS_URL}/${NON_BUILTIN_USER_ID}/identities`))

    // Identity is visible in the table
    await expect(app.getByRole('gridcell', { name: /Corporate SSO/ })).toBeVisible({ timeout: 15_000 })

    // Click Disconnect on the identity row
    await app.getByRole('button', { name: 'Disconnect' }).click()

    // Confirmation dialog
    const dialog = app.getByRole('dialog', { name: 'Disconnect identity?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Disconnecting will remove sign-in access')).toBeVisible()
    await expect(dialog.getByText('Corporate SSO')).toBeVisible()
    await expect(dialog.getByText('jdoe@example.com')).toBeVisible()

    // Confirm disconnect
    await dialog.getByRole('button', { name: 'Disconnect' }).click()

    // Success alert and identity removed
    await expect(app.getByText('Identity disconnected')).toBeVisible({ timeout: 10_000 })
    await expect(app.getByRole('button', { name: 'Disconnect' })).not.toBeAttached()
    await expect(app.getByText('Not connected')).toBeVisible()
  })
})
