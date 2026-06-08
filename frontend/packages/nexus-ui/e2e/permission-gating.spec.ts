/**
 * E2E Tests: Permission Gating (AAP-74439)
 *
 * Validates that navigation items, page tabs, action buttons, and route guards
 * are correctly shown, hidden, or disabled based on the user's role/permissions.
 *
 * Dual-mode: runs against both mock API (via token interception) and a real
 * backend (via dynamically created users — see roleSetup.ts / fixtures.ts).
 *
 * All tests are self-contained: they create any required seed data via the
 * admin API and clean up in `finally` blocks, so they pass on an empty backend.
 *
 * Roles tested:
 * - admin:   full access to all features
 * - viewer:  read-only on workflow, execution, approval, credential
 * - auditor: read-only on all resources except user_identity
 * - user:    read on workflow, execution, approval, credential, user, group, role, policy, authz
 */

import { type Page, test, expect, toAppUrl, appBaseUrl } from './fixtures'
import { buildUniqueName } from './helpers/workflows'
import {
  apiRequest,
  createCredentialViaApi,
  createGroupViaApi,
  createIdentityProviderViaApi,
  deleteCredentialViaApi,
  deleteGroupViaApi,
  deleteIdentityProviderViaApi,
  ensureProject,
} from './utils/api'

const AM_URL = '/system-administration/access-management'
const AUTH_URL = '/system-administration/authentication'

// ── Shared helpers ────────────────────────────────────────────────────────

async function createTestWorkflow(adminApp: Page): Promise<string> {
  const name = buildUniqueName('e2e-perm-wf')
  const resp = await apiRequest(adminApp, 'post', '/workflows', {
    data: {
      name,
      workflow_definition: {
        schema_version: '2.0.0',
        name,
        triggers: [{ id: 'trigger-1', type: 'manual', data: { name: 'Manual trigger' } }],
        nodes: [],
        edges: [],
      },
    },
  })
  if (!resp.ok()) throw new Error(`Workflow creation failed: ${resp.status()}`)
  const body = (await resp.json()) as { id: string }
  return body.id
}

async function deleteTestWorkflow(adminApp: Page, workflowId: string): Promise<void> {
  await apiRequest(adminApp, 'delete', `/workflows/${workflowId}`)
}

async function createTestCredential(adminApp: Page): Promise<string> {
  const project = await ensureProject(adminApp)
  if (!project) throw new Error('ensureProject failed')
  const credId = await createCredentialViaApi(adminApp, {
    name: buildUniqueName('e2e-perm-cred'),
    projectId: project.id,
  })
  if (!credId) throw new Error('createCredentialViaApi failed')
  return credId
}

// ── Navigation visibility ────────────────────────────────────────────────

test.describe('Permission gating — Navigation visibility', () => {
  test('admin sees all navigation items', async ({ app }) => {
    const nav = app.getByRole('navigation', { name: 'Main navigation' })

    await expect(nav.getByRole('link', { name: 'Workflows' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Workflow Runs' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Approvals' })).toBeVisible()

    const configItem = nav.getByLabel('Configuration')
    await expect(configItem).toBeVisible()
    await configItem.click()
    await expect(app.getByRole('menuitem', { name: 'Integrations' })).toBeVisible()
    await expect(app.getByRole('menuitem', { name: 'Credentials' })).toBeVisible()
    await app.keyboard.press('Escape')

    const sysAdminItem = nav.getByLabel('System Administration')
    await expect(sysAdminItem).toBeVisible()
    await sysAdminItem.click()
    await expect(app.getByRole('menuitem', { name: 'Access Management' })).toBeVisible()
    await expect(app.getByRole('menuitem', { name: 'Identity Providers' })).toBeVisible()
    await expect(app.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
    await expect(app.getByRole('menuitem', { name: 'Audit Log' })).toBeVisible()
  })

  test('viewer sees only operational items — no System Administration', async ({ viewerApp }) => {
    const nav = viewerApp.getByRole('navigation', { name: 'Main navigation' })

    await expect(nav.getByRole('link', { name: 'Workflows' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Workflow Runs' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Approvals' })).toBeVisible()
    await expect(nav.getByLabel('Configuration')).toBeVisible()

    await expect(nav.getByLabel('System Administration')).not.toBeVisible()
  })

  test('auditor sees all navigation items', async ({ auditorApp }) => {
    const nav = auditorApp.getByRole('navigation', { name: 'Main navigation' })

    await expect(nav.getByRole('link', { name: 'Workflows' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Workflow Runs' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Approvals' })).toBeVisible()
    await expect(nav.getByLabel('Configuration')).toBeVisible()

    const sysAdminItem = nav.getByLabel('System Administration')
    await expect(sysAdminItem).toBeVisible()
    await sysAdminItem.click()
    await expect(auditorApp.getByRole('menuitem', { name: 'Access Management' })).toBeVisible()
    await expect(auditorApp.getByRole('menuitem', { name: 'Identity Providers' })).toBeVisible()
    await expect(auditorApp.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
    await expect(auditorApp.getByRole('menuitem', { name: 'Audit Log' })).toBeVisible()
  })

  test('user sees Access Management but not Identity Providers, Settings, or Audit Log', async ({ userApp }) => {
    const nav = userApp.getByRole('navigation', { name: 'Main navigation' })

    await expect(nav.getByRole('link', { name: 'Workflows' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Workflow Runs' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Approvals' })).toBeVisible()
    await expect(nav.getByLabel('Configuration')).toBeVisible()

    // When only one SA child is visible (Access Management), the nav renders
    // a direct link instead of a flyout dropdown.
    const sysAdminLink = nav.getByLabel('System Administration')
    await expect(sysAdminLink).toBeVisible()
    await sysAdminLink.click()
    await expect(userApp.getByRole('heading', { name: 'Access Management' })).toBeVisible()
  })
})

// ── Access Management tab visibility ─────────────────────────────────────

test.describe('Permission gating — Access Management tabs', () => {
  const ALL_AM_TABS = [
    'Users',
    'Groups',
    'Projects',
    'Policies',
    'Roles',
    'Assignments',
    'Can I?',
    'Token Revocation',
  ] as const

  test('admin sees all AM tabs', async ({ app }) => {
    await app.goto(toAppUrl(`${AM_URL}/users`))
    await expect(app.getByRole('heading', { name: 'Access Management' })).toBeVisible()

    for (const tab of ALL_AM_TABS) {
      await expect(app.getByRole('tab', { name: tab })).toBeVisible()
    }
  })

  test('auditor sees all AM tabs', async ({ auditorApp }) => {
    await auditorApp.goto(toAppUrl(`${AM_URL}/users`))
    await expect(auditorApp.getByRole('heading', { name: 'Access Management' })).toBeVisible()

    for (const tab of ALL_AM_TABS) {
      await expect(auditorApp.getByRole('tab', { name: tab })).toBeVisible()
    }
  })

  test('user sees Users, Groups, Policies, Roles, Can I? — not Projects, Assignments, or Token Revocation', async ({
    userApp,
  }) => {
    await userApp.goto(toAppUrl(`${AM_URL}/users`))
    await expect(userApp.getByRole('heading', { name: 'Access Management' })).toBeVisible()

    const visibleTabs = ['Users', 'Groups', 'Policies', 'Roles', 'Can I?'] as const
    for (const tab of visibleTabs) {
      await expect(userApp.getByRole('tab', { name: tab })).toBeVisible()
    }

    const hiddenTabs = ['Projects', 'Assignments', 'Token Revocation'] as const
    for (const tab of hiddenTabs) {
      await expect(userApp.getByRole('tab', { name: tab })).not.toBeVisible()
    }
  })
})

// ── Detail page tab visibility ───────────────────────────────────────────

test.describe('Permission gating — Detail page tabs', () => {
  test('user: group detail hides Assignments tab when role-assignment:read is denied', async ({ app, userApp }) => {
    const groupId = await createGroupViaApi(app, { name: buildUniqueName('e2e-perm-group') })
    if (!groupId) throw new Error('createGroupViaApi failed to create group')

    try {
      await userApp.goto(toAppUrl(`${AM_URL}/groups/${groupId}`))
      await expect(userApp.getByRole('heading', { level: 1 })).toBeVisible()

      await expect(userApp.getByRole('tab', { name: /Details/ })).toBeVisible()
      await expect(userApp.getByRole('tab', { name: /Members/ })).toBeVisible()
      await expect(userApp.getByRole('tab', { name: /Assignments/ })).not.toBeVisible()
    } finally {
      await deleteGroupViaApi(app, groupId)
    }
  })

  test('auditor: group detail shows Assignments tab', async ({ app, auditorApp }) => {
    const groupId = await createGroupViaApi(app, { name: buildUniqueName('e2e-perm-group') })
    if (!groupId) throw new Error('createGroupViaApi failed to create group')

    try {
      await auditorApp.goto(toAppUrl(`${AM_URL}/groups/${groupId}`))
      await expect(auditorApp.getByRole('heading', { level: 1 })).toBeVisible()

      await expect(auditorApp.getByRole('tab', { name: /Details/ })).toBeVisible()
      await expect(auditorApp.getByRole('tab', { name: /Members/ })).toBeVisible()
      await expect(auditorApp.getByRole('tab', { name: /Assignments/ })).toBeVisible()
    } finally {
      await deleteGroupViaApi(app, groupId)
    }
  })
})

// ── Route-level guards ────────────────────────────────────────────────────

test.describe('Permission gating — Route guards', () => {
  const ACCESS_DENIED_ROUTES = [
    [`${AM_URL}/users/create`, 'Create User'],
    [`${AM_URL}/users/any-user-id/edit`, 'Edit User'],
    [`${AUTH_URL}/identity-providers/add`, 'Add Identity Provider'],
    [`${AUTH_URL}/identity-providers/any-provider-id/edit`, 'Edit Identity Provider'],
  ] as const

  for (const [url, label] of ACCESS_DENIED_ROUTES) {
    test(`user: direct URL to ${label} shows access denied`, async ({ userApp }) => {
      await userApp.goto(toAppUrl(url))
      await expect(userApp.getByRole('heading', { name: 'Access denied', level: 2 })).toBeVisible()
    })

    test(`auditor: direct URL to ${label} shows access denied`, async ({ auditorApp }) => {
      await auditorApp.goto(toAppUrl(url))
      await expect(auditorApp.getByRole('heading', { name: 'Access denied', level: 2 })).toBeVisible()
    })
  }

  test('viewer: direct URL to Create User shows access denied', async ({ viewerApp }) => {
    await viewerApp.goto(toAppUrl(`${AM_URL}/users/create`))

    await expect(viewerApp.getByRole('heading', { name: 'Access denied', level: 2 })).toBeVisible()
  })

  test('viewer: direct URL to Add Identity Provider shows access denied', async ({ viewerApp }) => {
    await viewerApp.goto(toAppUrl(`${AUTH_URL}/identity-providers/add`))

    await expect(viewerApp.getByRole('heading', { name: 'Access denied', level: 2 })).toBeVisible()
  })

  test('viewer: direct URL to Access Management shows access denied', async ({ viewerApp }) => {
    await viewerApp.goto(toAppUrl(`${AM_URL}/users`))

    await expect(viewerApp.getByRole('heading', { name: 'Access denied', level: 2 })).toBeVisible()
  })

  test('admin: direct URL to Create User renders the form', async ({ app }) => {
    await app.goto(toAppUrl(`${AM_URL}/users/create`))

    await expect(app.getByRole('heading', { name: 'Access denied' })).not.toBeVisible()
    await expect(app.getByRole('heading', { name: /Create User/i })).toBeVisible()
  })
})

// ── Action gating — Workflows ────────────────────────────────────────────

test.describe('Permission gating — Workflow actions', () => {
  test('viewer: Create workflow button is disabled with tooltip', async ({ app, viewerApp }) => {
    const workflowId = await createTestWorkflow(app)

    try {
      await viewerApp.goto(toAppUrl('/workflows'))
      await expect(viewerApp.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()

      const createButton = viewerApp.getByRole('button', { name: /Create workflow/i })
      await expect(createButton).toBeVisible()
      await expect(createButton).toHaveAttribute('aria-disabled', 'true')

      await createButton.hover()
      await expect(viewerApp.getByRole('tooltip')).toContainText('workflow:create')
    } finally {
      await deleteTestWorkflow(app, workflowId)
    }
  })

  test('auditor: Create workflow button is disabled', async ({ app, auditorApp }) => {
    const workflowId = await createTestWorkflow(app)

    try {
      await auditorApp.goto(toAppUrl('/workflows'))
      await expect(auditorApp.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()

      const createButton = auditorApp.getByRole('button', { name: /Create workflow/i })
      await expect(createButton).toBeVisible()
      await expect(createButton).toHaveAttribute('aria-disabled', 'true')
    } finally {
      await deleteTestWorkflow(app, workflowId)
    }
  })

  test('viewer: Import workflow button is disabled', async ({ app, viewerApp }) => {
    const workflowId = await createTestWorkflow(app)

    try {
      await viewerApp.goto(toAppUrl('/workflows'))
      await expect(viewerApp.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()

      const importButton = viewerApp.getByRole('button', { name: /Import workflow/i })
      await expect(importButton).toBeVisible()
      await expect(importButton).toHaveAttribute('aria-disabled', 'true')
    } finally {
      await deleteTestWorkflow(app, workflowId)
    }
  })

  test('auditor: Import workflow button is disabled', async ({ app, auditorApp }) => {
    const workflowId = await createTestWorkflow(app)

    try {
      await auditorApp.goto(toAppUrl('/workflows'))
      await expect(auditorApp.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()

      const importButton = auditorApp.getByRole('button', { name: /Import workflow/i })
      await expect(importButton).toBeVisible()
      await expect(importButton).toHaveAttribute('aria-disabled', 'true')
    } finally {
      await deleteTestWorkflow(app, workflowId)
    }
  })

  test('viewer: all workflow row actions are aria-disabled', async ({ app, viewerApp }) => {
    const workflowId = await createTestWorkflow(app)

    try {
      await viewerApp.goto(toAppUrl('/workflows'))
      await expect(viewerApp.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()

      const kebab = viewerApp.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await expect(kebab).toBeVisible({ timeout: 15_000 })
      await kebab.click({ force: true })

      await expect(viewerApp.getByRole('menuitem', { name: /Edit workflow/i })).toHaveAttribute('aria-disabled', 'true')
      await expect(viewerApp.getByRole('menuitem', { name: /Run workflow/i })).toHaveAttribute('aria-disabled', 'true')
      await expect(viewerApp.getByRole('menuitem', { name: /Duplicate workflow/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(viewerApp.getByRole('menuitem', { name: /^Publish workflow$/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(viewerApp.getByRole('menuitem', { name: /Delete workflow/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )

      // Non-gated actions remain enabled
      await expect(viewerApp.getByRole('menuitem', { name: /View run history/i })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(viewerApp.getByRole('menuitem', { name: /Export workflow/i })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    } finally {
      await deleteTestWorkflow(app, workflowId)
    }
  })

  test('auditor: all workflow row actions are aria-disabled', async ({ app, auditorApp }) => {
    const workflowId = await createTestWorkflow(app)

    try {
      await auditorApp.goto(toAppUrl('/workflows'))
      await expect(auditorApp.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()

      const kebab = auditorApp.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await expect(kebab).toBeVisible({ timeout: 15_000 })
      await kebab.click({ force: true })

      await expect(auditorApp.getByRole('menuitem', { name: /Edit workflow/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(auditorApp.getByRole('menuitem', { name: /Run workflow/i })).toHaveAttribute('aria-disabled', 'true')
      await expect(auditorApp.getByRole('menuitem', { name: /Duplicate workflow/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(auditorApp.getByRole('menuitem', { name: /^Publish workflow$/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(auditorApp.getByRole('menuitem', { name: /Delete workflow/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    } finally {
      await deleteTestWorkflow(app, workflowId)
    }
  })

  test('viewer: workflow row action tooltip explains the denial', async ({ app, viewerApp }) => {
    const workflowId = await createTestWorkflow(app)

    try {
      await viewerApp.goto(toAppUrl('/workflows'))
      await expect(viewerApp.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()

      const kebab = viewerApp.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await expect(kebab).toBeVisible({ timeout: 15_000 })
      await kebab.click({ force: true })

      const editItem = viewerApp.getByRole('menuitem', { name: /Edit workflow/i })
      await editItem.hover()
      await expect(viewerApp.getByRole('tooltip')).toContainText('workflow:update')
    } finally {
      await deleteTestWorkflow(app, workflowId)
    }
  })
})

// ── Action gating — Credentials ──────────────────────────────────────────

test.describe('Permission gating — Credential actions', () => {
  test('viewer: Create credential button is disabled with tooltip', async ({ app, viewerApp }) => {
    const credId = await createTestCredential(app)

    try {
      await viewerApp.goto(toAppUrl('/configuration/credentials'))
      await expect(viewerApp.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()

      const createButton = viewerApp.getByRole('button', { name: /Create credential/i })
      await expect(createButton).toBeVisible()
      await expect(createButton).toHaveAttribute('aria-disabled', 'true')

      await createButton.hover()
      await expect(viewerApp.getByRole('tooltip')).toContainText('credential:create')
    } finally {
      await deleteCredentialViaApi(app, credId)
    }
  })

  test('auditor: Create credential button is disabled', async ({ app, auditorApp }) => {
    const credId = await createTestCredential(app)

    try {
      await auditorApp.goto(toAppUrl('/configuration/credentials'))
      await expect(auditorApp.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()

      const createButton = auditorApp.getByRole('button', { name: /Create credential/i })
      await expect(createButton).toBeVisible()
      await expect(createButton).toHaveAttribute('aria-disabled', 'true')
    } finally {
      await deleteCredentialViaApi(app, credId)
    }
  })

  test('viewer: credential row actions are aria-disabled', async ({ app, viewerApp }) => {
    const credId = await createTestCredential(app)

    try {
      await viewerApp.goto(toAppUrl('/configuration/credentials'))
      await expect(viewerApp.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()

      const kebab = viewerApp.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await expect(kebab).toBeVisible({ timeout: 15_000 })
      await kebab.click({ force: true })

      await expect(viewerApp.getByRole('menuitem', { name: /Edit credential/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(viewerApp.getByRole('menuitem', { name: /Delete credential/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    } finally {
      await deleteCredentialViaApi(app, credId)
    }
  })

  test('auditor: credential row actions are aria-disabled', async ({ app, auditorApp }) => {
    const credId = await createTestCredential(app)

    try {
      await auditorApp.goto(toAppUrl('/configuration/credentials'))
      await expect(auditorApp.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()

      const kebab = auditorApp.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await expect(kebab).toBeVisible({ timeout: 15_000 })
      await kebab.click({ force: true })

      await expect(auditorApp.getByRole('menuitem', { name: /Edit credential/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(auditorApp.getByRole('menuitem', { name: /Delete credential/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    } finally {
      await deleteCredentialViaApi(app, credId)
    }
  })
})

// ── Action gating — Access Management ────────────────────────────────────

test.describe('Permission gating — Access Management actions', () => {
  test('auditor: Create group button is disabled', async ({ auditorApp }) => {
    await auditorApp.goto(toAppUrl(`${AM_URL}/groups`))
    await expect(auditorApp.getByRole('tab', { name: /Groups/i })).toBeVisible()

    const createButton = auditorApp.getByRole('button', { name: /Create group/i })
    await expect(createButton).toBeVisible()
    await expect(createButton).toHaveAttribute('aria-disabled', 'true')
  })

  test('auditor: Create user button is disabled', async ({ auditorApp }) => {
    await auditorApp.goto(toAppUrl(`${AM_URL}/users`))
    await expect(auditorApp.getByRole('tab', { name: /Users/i })).toBeVisible()

    const createButton = auditorApp.getByRole('button', { name: /Create user/i })
    await expect(createButton).toBeVisible()
    await expect(createButton).toHaveAttribute('aria-disabled', 'true')
  })

  test('user: Create group button is disabled', async ({ userApp }) => {
    await userApp.goto(toAppUrl(`${AM_URL}/groups`))
    await expect(userApp.getByRole('tab', { name: /Groups/i })).toBeVisible()

    const createButton = userApp.getByRole('button', { name: /Create group/i })
    await expect(createButton).toBeVisible()
    await expect(createButton).toHaveAttribute('aria-disabled', 'true')
  })

  test('user: Create user button is disabled with tooltip', async ({ userApp }) => {
    await userApp.goto(toAppUrl(`${AM_URL}/users`))
    await expect(userApp.getByRole('tab', { name: /Users/i })).toBeVisible()

    const createButton = userApp.getByRole('button', { name: /Create user/i })
    await expect(createButton).toBeVisible()
    await expect(createButton).toHaveAttribute('aria-disabled', 'true')

    await createButton.hover()
    await expect(userApp.getByRole('tooltip')).toContainText('user:create')
  })
})

// ── Action gating — Identity Providers ───────────────────────────────────

test.describe('Permission gating — Identity Provider actions', () => {
  test('auditor: Add OIDC provider button is disabled with tooltip', async ({ auditorApp }) => {
    await auditorApp.goto(toAppUrl(`${AUTH_URL}`))
    await expect(auditorApp.getByRole('heading', { name: 'Identity Providers', level: 1 })).toBeVisible()

    const addButton = auditorApp.getByRole('button', { name: /Add OIDC provider/i })
    await expect(addButton).toBeVisible()
    await expect(addButton).toHaveAttribute('aria-disabled', 'true')

    await addButton.hover()
    await expect(auditorApp.getByRole('tooltip')).toContainText('identity-provider:create')
  })

  test('auditor: IdP row actions are aria-disabled', async ({ app, auditorApp }) => {
    const idp = await createIdentityProviderViaApi(app, {
      name: buildUniqueName('e2e-perm-idp'),
      enabled: false,
      configuration: {
        provider_type: 'oidc',
        client_id: 'e2e-test',
        client_secret: 'e2e-secret',
        issuer_url: 'https://idp.example.com',
        redirect_uri: `${appBaseUrl}/auth/callback`,
      },
    })
    if (!idp) throw new Error('createIdentityProviderViaApi failed')

    try {
      await auditorApp.goto(toAppUrl(`${AUTH_URL}`))
      await expect(auditorApp.getByRole('heading', { name: 'Identity Providers', level: 1 })).toBeVisible()

      const kebab = auditorApp.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await expect(kebab).toBeVisible({ timeout: 15_000 })
      await kebab.click({ force: true })

      await expect(auditorApp.getByRole('menuitem', { name: /Edit provider/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await expect(auditorApp.getByRole('menuitem', { name: /Delete/i })).toHaveAttribute('aria-disabled', 'true')
      await expect(auditorApp.getByRole('menuitem', { name: /Revoke tokens/i })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    } finally {
      await deleteIdentityProviderViaApi(app, idp.id)
    }
  })
})

// ── Action gating — Builder ──────────────────────────────────────────────

test.describe('Permission gating — Builder read-only', () => {
  test('viewer: builder shows read-only info alert', async ({ app, viewerApp }) => {
    const workflowId = await createTestWorkflow(app)

    try {
      await viewerApp.goto(toAppUrl(`/workflow-builder/${workflowId}`))
      await viewerApp.getByRole('navigation', { name: 'Main navigation' }).waitFor()

      await expect(viewerApp.getByRole('heading', { name: /read-only mode/i, level: 4 })).toBeVisible({
        timeout: 15_000,
      })
    } finally {
      await deleteTestWorkflow(app, workflowId)
    }
  })

  test('auditor: builder shows read-only info alert', async ({ app, auditorApp }) => {
    const workflowId = await createTestWorkflow(app)

    try {
      await auditorApp.goto(toAppUrl(`/workflow-builder/${workflowId}`))
      await auditorApp.getByRole('navigation', { name: 'Main navigation' }).waitFor()

      await expect(auditorApp.getByRole('heading', { name: /read-only mode/i, level: 4 })).toBeVisible({
        timeout: 15_000,
      })
    } finally {
      await deleteTestWorkflow(app, workflowId)
    }
  })
})
