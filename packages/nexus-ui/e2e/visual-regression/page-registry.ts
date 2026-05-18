/**
 * Page registry for visual regression testing.
 *
 * Every implemented route in the app should have an entry here.
 * The baseline enforcement script (`scripts/check-visual-baselines.ts`)
 * validates that this registry stays in sync with `AppRoute.tsx`.
 *
 * Entries are organized by section (matching the route directory structure)
 * and include multiple states per page where relevant:
 *   - Default list view (with data)
 *   - Empty state (no data / filters returning nothing)
 *   - Modals and dialogs (create, edit, delete confirmations)
 *   - Detail pages with tabs
 */
import { type Page, expect } from '@playwright/test'

import { AppRoute } from '../../src/app/AppRoute'

import { builderInteractivePages, detailTabPages, statusVariantPages } from './page-entries-interactive'

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
    path: AppRoute.Workflows.Root,
    waitFor: async (page) => {
      await expect(page.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'workflows-list-empty-filter',
    path: AppRoute.Workflows.Root,
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
    path: AppRoute.Workflows.Root,
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
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_WORKFLOW_ID),
    waitFor: async (page) => {
      // ReactFlow + Zustand + lazy-load initialization is slow in CI — extend timeout
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
  },
  ...builderInteractivePages,

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTIONS
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'executions',
    name: 'executions-list',
    path: AppRoute.Executions.Root,
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
    path: AppRoute.Executions.Execution.replace(':executionId', MOCK_EXECUTION_ID),
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
    path: AppRoute.Approvals.Root,
    waitFor: async (page) => {
      await expect(page.getByText('Approvals', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approvals-list-empty-filter',
    path: AppRoute.Approvals.Root,
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
    path: AppRoute.Approvals.Approval.replace(':approvalId', MOCK_APPROVAL_ID),
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
    path: AppRoute.AccessManagement.Users,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'users-list-empty-filter',
    path: AppRoute.AccessManagement.Users,
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
    path: AppRoute.AccessManagement.Users,
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
    path: AppRoute.AccessManagement.CreateUser,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Create User' })).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'user-detail',
    path: AppRoute.AccessManagement.UserDetail.replace(':userId', MOCK_USER_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'user-edit',
    path: AppRoute.AccessManagement.EditUser.replace(':userId', MOCK_USER_ID),
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
    path: AppRoute.AccessManagement.Groups,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'access-management/groups',
    name: 'groups-list-empty-filter',
    path: AppRoute.AccessManagement.Groups,
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
    path: AppRoute.AccessManagement.Groups,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Create group' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    section: 'access-management/groups',
    name: 'groups-delete-dialog',
    path: AppRoute.AccessManagement.Groups,
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
    path: AppRoute.AccessManagement.GroupDetail.replace(':groupId', MOCK_GROUP_ID),
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
    path: AppRoute.AccessManagement.Projects,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'access-management/projects',
    name: 'projects-create-modal',
    path: AppRoute.AccessManagement.Projects,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Create project' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    section: 'access-management/projects',
    name: 'project-detail',
    path: AppRoute.AccessManagement.ProjectDetail.replace(':projectId', MOCK_PROJECT_ID),
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
    path: AppRoute.AccessManagement.Roles,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'access-management/roles',
    name: 'roles-add-dialog',
    path: AppRoute.AccessManagement.Roles,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Create role' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Policies
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/policies',
    name: 'policies-list',
    path: AppRoute.AccessManagement.Policies,
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
    path: AppRoute.AccessManagement.Assignments,
    waitFor: async (page) => {
      await expect(page.getByRole('tab', { name: 'Assignments' })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Can I?
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'access-management/can-i',
    name: 'can-i',
    path: AppRoute.AccessManagement.CanI,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Access Management' })).toBeVisible()
    },
  },
  {
    section: 'access-management/can-i',
    name: 'can-i-who-can',
    path: `${AppRoute.AccessManagement.CanI}/who-can`,
    waitFor: async (page) => {
      await expect(page.getByRole('tab', { name: 'Find users who can perform an action' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    },
  },
  {
    section: 'access-management/can-i',
    name: 'can-i-my-permissions',
    path: `${AppRoute.AccessManagement.CanI}/my-permissions`,
    waitFor: async (page) => {
      await expect(page.getByRole('tab', { name: 'View all permissions for a user' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Authentication
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'authentication',
    name: 'authentication',
    path: AppRoute.SystemAdministration.Authentication.Root,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Identity Providers' })).toBeVisible()
    },
  },
  {
    section: 'authentication',
    name: 'identity-provider-add',
    path: AppRoute.SystemAdministration.Authentication.AddIdentityProvider,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Add OIDC provider' })).toBeVisible()
    },
  },
  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS MANAGEMENT — Audit Log
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'audit-log',
    name: 'audit-log-list',
    path: AppRoute.SystemAdministration.AuditLog,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'audit-log',
    name: 'audit-log-expanded-row',
    path: AppRoute.SystemAdministration.AuditLog,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page
        .getByRole('button', { name: /details/i })
        .first()
        .click()
      await expect(page.getByText('Event Message').first()).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION — Settings
  // ══════════════════════════════════════════════════════════════════════════
  {
    section: 'settings',
    name: 'settings',
    path: AppRoute.SystemAdministration.Settings,
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
    path: AppRoute.Configuration.Integrations.Root,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'configuration/integrations',
    name: 'integrations-list-empty-filter',
    path: AppRoute.Configuration.Integrations.Root,
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
    path: AppRoute.Configuration.Integrations.Configure,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Configure integration' })).toBeVisible()
    },
  },
  {
    section: 'configuration/integrations',
    name: 'integration-tools',
    path: AppRoute.Configuration.Integrations.IntegrationTools.replace(':provider_id', MOCK_PROVIDER_ID),
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
    path: AppRoute.Configuration.Credentials.Root,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
  },
  {
    section: 'configuration/credentials',
    name: 'credentials-list-empty-filter',
    path: AppRoute.Configuration.Credentials.Root,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      const filterInput = page.getByPlaceholder('Filter by keyword')
      await filterInput.fill('zzz-no-match-zzz')
      await filterInput.press('Enter')
      await expect(page.getByText(/No results found|Adjust your filters/i)).toBeVisible()
    },
  },
  {
    section: 'configuration/credentials',
    name: 'credentials-create-modal',
    path: AppRoute.Configuration.Credentials.Root,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      // Pick a project so the modal's Project dropdown is pre-populated
      await page.getByRole('textbox', { name: 'Project' }).click()
      await page.getByRole('option', { name: 'default' }).click()
      await page.getByRole('button', { name: /create credential/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    section: 'configuration/credentials',
    name: 'credential-detail',
    path: AppRoute.Configuration.Credentials.Detail.replace(':credentialId', MOCK_CREDENTIAL_ID),
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
    path: AppRoute.Support.Glossary,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Glossary' })).toBeVisible()
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // INTERACTIVE STATES — status variants, detail tabs
  // (entries defined in page-entries-interactive.ts)
  // ══════════════════════════════════════════════════════════════════════════
  ...statusVariantPages,
  ...detailTabPages,
]

// ---------------------------------------------------------------------------
// Routes intentionally excluded from visual regression
// ---------------------------------------------------------------------------

/** Routes in AppRoute.tsx that have no implementation (placeholder/unimplemented) */
export const excludedUnimplemented: string[] = [
  AppRoute.Dashboard,
  AppRoute.Configuration.Overview,
  AppRoute.Support.Documentation,
  AppRoute.Support.FAQ,
]

/** Routes excluded because they need dynamic setup or have no seeded mock data */
export const excludedDynamic: string[] = [
  AppRoute.WorkflowBuilder.New,
  AppRoute.SystemAdministration.Root,
  AppRoute.SystemAdministration.Authentication.IdentityProviderDetail,
  AppRoute.SystemAdministration.Authentication.EditIdentityProvider,
  AppRoute.AccessManagement.Root,
  AppRoute.Auth.TestSignInCallback,
  AppRoute.Profile, // redirects to user detail — no longer a standalone page
]

/** All excluded route patterns (union of both lists) */
export const allExcludedRoutes: string[] = [...excludedUnimplemented, ...excludedDynamic]
