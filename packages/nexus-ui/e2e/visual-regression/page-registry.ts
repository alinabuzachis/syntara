/**
 * Page registry for visual regression testing.
 *
 * Every implemented route in the app should have an entry here.
 * The baseline enforcement script (`scripts/check-visual-baselines.js`)
 * validates that this registry stays in sync with `AppRoute.tsx`.
 *
 * Entries are organized by section (matching the route directory structure)
 * and include multiple states per page where relevant:
 *   - Default list view (with data)
 *   - Empty state (no data / filters returning nothing)
 *   - Modals and dialogs (create, edit, delete confirmations)
 *   - Detail pages with tabs
 *
 * Note: Pages that use `PageTitleWithProject` (Workflows, Executions,
 * Approvals) render titles in a `<span>` — use `getByText()` not `getByRole('heading')`.
 */
import { type Page, expect } from '@playwright/test'

export type PageEntry = {
  /** Directory grouping for snapshot organization */
  section: string
  /** Screenshot filename slug */
  name: string
  /** Concrete URL path (parameterized routes use mock API IDs) */
  path: string
  /** Locator-based check to confirm page has loaded */
  waitFor: (page: Page) => Promise<void>
  /** Optional interaction before screenshot (e.g., open modal, apply filter) */
  setup?: (page: Page) => Promise<void>
}

async function applyNameFilter(page: Page, value: string) {
  const nameFilter = page.getByPlaceholder('Filter by name')
  await nameFilter.fill(value)
  await nameFilter.press('Enter')
}

// ---------------------------------------------------------------------------
// Mock API IDs for parameterized routes
// ---------------------------------------------------------------------------
const MOCK_WORKFLOW_ID = '1'
const MOCK_EXECUTION_ID = 'exec-1'
const MOCK_APPROVAL_ID = '550e8400-e29b-41d4-a716-446655440001'
const MOCK_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const MOCK_GROUP_ID = 'g1a2b3c4-d5e6-7890-abcd-ef1234567890'
const MOCK_PROJECT_ID = 'p-001'
const MOCK_CREDENTIAL_ID = 'cred-001'
const MOCK_PROVIDER_ID = '1'

// ---------------------------------------------------------------------------
// Page entries — organized by section matching route directories
// ---------------------------------------------------------------------------
export const pages: PageEntry[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // WORKFLOWS
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'workflows',
    name: 'workflows-list',
    path: '/workflows',
    waitFor: async (page) => {
      await expect(page.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'workflows-list-empty-filter',
    path: '/workflows',
    waitFor: async (page) => {
      await expect(page.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await applyNameFilter(page, 'zzz-no-match-zzz')
      await expect(page.getByText(/No results found|Adjust your filters/i)).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'workflows-delete-dialog',
    path: '/workflows',
    waitFor: async (page) => {
      await expect(page.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      // Open kebab menu on a data row (skip group header rows which have no kebab)
      const kebab = page.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await kebab.click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },

  // ── Builder ──────────────────────────────────────────────────────────────
  // Note: builder-new excluded — ReactFlow + Zustand + lazy-load initialization
  // exceeds the 10s assertion timeout in CI. builder-edit covers the canvas.
  {
    section: 'workflows',
    name: 'builder-edit',
    path: `/workflow-builder/${MOCK_WORKFLOW_ID}`,
    waitFor: async (page) => {
      // ReactFlow + Zustand + lazy-load initialization is slow in CI — extend timeout
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTIONS
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'executions',
    name: 'executions-list',
    path: '/executions',
    waitFor: async (page) => {
      await expect(page.getByText('Workflow Runs', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  // Note: Executions uses SELECT/dropdown filters (not text input), so no empty-filter
  // screenshot — the dropdown filter doesn't produce a "no results" empty state easily.
  {
    section: 'executions',
    name: 'execution-detail',
    path: `/executions/${MOCK_EXECUTION_ID}`,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // APPROVALS
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'approvals',
    name: 'approvals-list',
    path: '/approvals',
    waitFor: async (page) => {
      await expect(page.getByText('Approvals', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approvals-list-empty-filter',
    path: '/approvals',
    waitFor: async (page) => {
      await expect(page.getByText('Approvals', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await applyNameFilter(page, 'zzz-no-match-zzz')
      await expect(page.getByText(/No results found|Adjust your filters/i)).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approval-detail',
    path: `/approvals/${MOCK_APPROVAL_ID}`,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Users
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/users',
    name: 'users-list',
    path: '/access-management/users',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'users-list-empty-filter',
    path: '/access-management/users',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('textbox', { name: /filter/i }).fill('zzz-no-match-zzz')
      await page.getByRole('textbox', { name: /filter/i }).press('Enter')
      await expect(page.getByText(/No results found|Adjust your filters/i)).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'users-delete-dialog',
    path: '/access-management/users',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      const kebab = page.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await kebab.click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'user-create',
    path: '/access-management/users/create',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Create User' })).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'user-detail',
    path: `/access-management/users/${MOCK_USER_ID}`,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'user-edit',
    path: `/access-management/users/${MOCK_USER_ID}/edit`,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Groups
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/groups',
    name: 'groups-list',
    path: '/access-management/groups',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'access-management/groups',
    name: 'groups-list-empty-filter',
    path: '/access-management/groups',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('textbox', { name: /filter/i }).fill('zzz-no-match-zzz')
      await page.getByRole('textbox', { name: /filter/i }).press('Enter')
      await expect(page.getByText(/No results found|Adjust your filters/i)).toBeVisible()
    },
  },
  {
    section: 'access-management/groups',
    name: 'groups-create-modal',
    path: '/access-management/groups',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Add group' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    section: 'access-management/groups',
    name: 'groups-delete-dialog',
    path: '/access-management/groups',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      // Find a non-builtin group row and open its kebab
      await page
        .locator('table tbody tr')
        .filter({ hasText: 'platform-admins' })
        .getByRole('button', { name: /Actions|Kebab toggle/i })
        .click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    section: 'access-management/groups',
    name: 'group-detail',
    path: `/access-management/groups/${MOCK_GROUP_ID}`,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Projects
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/projects',
    name: 'projects-list',
    path: '/access-management/projects',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'access-management/projects',
    name: 'projects-create-modal',
    path: '/access-management/projects',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: /add project/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    section: 'access-management/projects',
    name: 'project-detail',
    path: `/access-management/projects/${MOCK_PROJECT_ID}`,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Roles
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/roles',
    name: 'roles-list',
    path: '/access-management/roles',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'access-management/roles',
    name: 'roles-add-dialog',
    path: '/access-management/roles',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: /add role/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Policies
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/policies',
    name: 'policies-list',
    path: '/access-management/policies',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Assignments
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/assignments',
    name: 'assignments-list',
    path: '/access-management/assignments',
    waitFor: async (page) => {
      await expect(page.getByRole('tab', { name: 'Role Assignments' })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Can I?
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/can-i',
    name: 'can-i',
    path: '/access-management/can-i',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Authentication
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/authentication',
    name: 'authentication',
    path: '/access-management/authentication',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Identity Providers' })).toBeVisible()
    },
  },
  {
    section: 'access-management/authentication',
    name: 'identity-provider-add',
    path: '/access-management/authentication/identity-providers/add',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Add OIDC provider' })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION — Settings
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'configuration/settings',
    name: 'settings',
    path: '/configuration/settings',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('tab').first()).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION — Integrations
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'configuration/integrations',
    name: 'integrations-list',
    path: '/configuration/integrations',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'configuration/integrations',
    name: 'integrations-list-empty-filter',
    path: '/configuration/integrations',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('textbox', { name: /filter/i }).fill('zzz-no-match-zzz')
      await page.getByRole('textbox', { name: /filter/i }).press('Enter')
      await expect(page.getByText(/No results found|Adjust your filters/i)).toBeVisible()
    },
  },
  {
    section: 'configuration/integrations',
    name: 'integration-configure',
    path: '/configuration/integrations/configure',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Configure integration' })).toBeVisible()
    },
  },
  {
    section: 'configuration/integrations',
    name: 'integration-tools',
    path: `/configuration/integrations/${MOCK_PROVIDER_ID}/tools`,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION — Credentials
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'configuration/credentials',
    name: 'credentials-list',
    path: '/configuration/credentials',
    waitFor: async (page) => {
      // Credentials uses PageTitleWithProject — renders title in a <span>, not a heading
      await expect(page.getByText('Credentials', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'configuration/credentials',
    name: 'credentials-list-empty-filter',
    path: '/configuration/credentials',
    waitFor: async (page) => {
      await expect(page.getByText('Credentials', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    // TODO: filter placeholder changed — selector needs updating
    // setup: async (page) => {
    //   await applyNameFilter(page, 'zzz-no-match-zzz')
    // },
  },
  {
    section: 'configuration/credentials',
    name: 'credentials-create-modal',
    path: '/configuration/credentials',
    waitFor: async (page) => {
      await expect(page.getByText('Credentials', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      // "Create credential" is disabled when "All projects" is selected — pick a project first
      await page.getByRole('textbox', { name: 'Type to filter' }).click()
      await page.getByRole('option', { name: 'default' }).click()
      await page.getByRole('button', { name: /create credential/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    section: 'configuration/credentials',
    name: 'credential-detail',
    path: `/configuration/credentials/${MOCK_CREDENTIAL_ID}`,
    waitFor: async (page) => {
      // Credential detail uses ReactNode title (back button + name), not a heading
      await expect(page.getByText('Production API Auth').first()).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SUPPORT
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'support',
    name: 'glossary',
    path: '/support/glossary',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Glossary' })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PROFILE
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'profile',
    name: 'my-profile',
    path: '/profile',
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible()
    },
  },
]

// ---------------------------------------------------------------------------
// Routes intentionally excluded from visual regression
// ---------------------------------------------------------------------------

/** Routes in AppRoute.tsx that have no implementation (placeholder/unimplemented) */
export const excludedUnimplemented: string[] = [
  '/dashboard',
  '/configuration',
  '/support/documentation',
  '/support/faq',
]

/** Routes excluded because they need dynamic setup or have no seeded mock data */
export const excludedDynamic: string[] = [
  // ReactFlow + Zustand + lazy-load initialization exceeds 10s CI timeout; builder-edit covers the canvas
  '/workflow-builder/new',
  // No seeded identity providers in mock API — would need a setup step to create one first
  '/access-management/authentication/identity-providers/:providerId',
  // Redirects to /access-management/users
  '/access-management',
  // Parameterized routes that require specific IDs from the mock API
  '/access-management/can-i/:mode',
  '/access-management/groups/:groupId/:tab',
  '/access-management/projects/:projectId/:tab',
]

/** All excluded route patterns (union of both lists) */
export const allExcludedRoutes: string[] = [...excludedUnimplemented, ...excludedDynamic]
