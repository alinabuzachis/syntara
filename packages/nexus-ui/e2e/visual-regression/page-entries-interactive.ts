/**
 * Interactive-state page entries for visual regression testing.
 *
 * These entries cover builder interaction states, detail page tabs,
 * status variants, and other interactive UI states that extend
 * the base page coverage in page-registry.ts.
 */
import { expect } from '@playwright/test'

import { AppRoute } from '../../src/app/AppRoute'

import type { PageEntry } from './page-registry'

// ---------------------------------------------------------------------------
// Mock API IDs for interactive state entries
// ---------------------------------------------------------------------------
const MOCK_WORKFLOW_ID = '1'
const MOCK_EXECUTION_FAILED_ID = 'exec-3'
const MOCK_EXECUTION_RUNNING_ID = 'exec-4'
const MOCK_EXECUTION_CANCELLED_ID = 'exec-8'
const MOCK_APPROVAL_APPROVED_ID = '550e8400-e29b-41d4-a716-446655440002'
const MOCK_APPROVAL_REJECTED_ID = '550e8400-e29b-41d4-a716-446655440003'
const MOCK_APPROVAL_EXPIRED_ID = '550e8400-e29b-41d4-a716-446655440007'
const MOCK_APPROVAL_CANCELLED_ID = '550e8400-e29b-41d4-a716-446655440008'
const MOCK_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const MOCK_GROUP_ID = 'g1a2b3c4-d5e6-7890-abcd-ef1234567890'
const MOCK_PROJECT_ID = 'p-001'
const MOCK_CREDENTIAL_ID = 'cred-001'
const MOCK_CREDENTIAL_DISABLED_ID = 'cred-003'

// ---------------------------------------------------------------------------
// Builder interaction states
// ---------------------------------------------------------------------------
export const builderInteractivePages: PageEntry[] = [
  {
    section: 'workflows',
    name: 'builder-edit-add-step-panel',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_WORKFLOW_ID),
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      await page.getByRole('button', { name: /Add Step/i }).click()
      const panel = page.getByRole('region', { name: /add step|select a step/i })
      await expect(panel).toBeVisible()
    },
  },
  {
    // Workflow "conditional-demo" (ID 1) — node "Check Temperature" is a script executor
    section: 'workflows',
    name: 'builder-edit-script-node-form',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_WORKFLOW_ID),
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      const scriptNode = page.getByRole('group', { name: /Check Temperature/i })
      await scriptNode.click({ force: true })
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible({
        timeout: 15_000,
      })
    },
  },
  {
    // Workflow "conditional-demo" (ID 1) — node "Temperature-Based Routing" is a condition
    section: 'workflows',
    name: 'builder-edit-condition-node-form',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_WORKFLOW_ID),
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      const conditionNode = page.getByRole('group', { name: /Temperature-Based Routing/i })
      await conditionNode.click({ force: true })
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible({
        timeout: 15_000,
      })
    },
  },
  {
    section: 'workflows',
    name: 'builder-edit-delete-dialog',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_WORKFLOW_ID),
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      const kebab = page.getByRole('button', { name: /kebab|actions/i }).first()
      await kebab.click()
      await page.getByRole('menuitem', { name: 'Delete workflow' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
]

// ---------------------------------------------------------------------------
// Status variant entries (execution, approval, credential states)
// ---------------------------------------------------------------------------
export const statusVariantPages: PageEntry[] = [
  {
    section: 'executions',
    name: 'execution-detail-failed',
    path: AppRoute.Executions.Execution.replace(':executionId', MOCK_EXECUTION_FAILED_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('heading', { name: /run failed/i })).toBeVisible()
    },
  },
  {
    section: 'executions',
    name: 'execution-detail-running',
    path: AppRoute.Executions.Execution.replace(':executionId', MOCK_EXECUTION_RUNNING_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Running', { exact: true }).first()).toBeVisible()
    },
  },
  {
    section: 'executions',
    name: 'execution-detail-cancelled',
    path: AppRoute.Executions.Execution.replace(':executionId', MOCK_EXECUTION_CANCELLED_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approval-detail-approved',
    path: AppRoute.Approvals.Approval.replace(':approvalId', MOCK_APPROVAL_APPROVED_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Approved', { exact: true })).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approval-detail-rejected',
    path: AppRoute.Approvals.Approval.replace(':approvalId', MOCK_APPROVAL_REJECTED_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Rejected', { exact: true })).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approval-detail-expired',
    path: AppRoute.Approvals.Approval.replace(':approvalId', MOCK_APPROVAL_EXPIRED_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Expired', { exact: true })).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approval-detail-cancelled',
    path: AppRoute.Approvals.Approval.replace(':approvalId', MOCK_APPROVAL_CANCELLED_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
    },
  },
  {
    section: 'configuration/credentials',
    name: 'credential-detail-disabled',
    path: AppRoute.Configuration.Credentials.Detail.replace(':credentialId', MOCK_CREDENTIAL_DISABLED_ID),
    waitFor: async (page) => {
      await expect(page.getByText('GitHub API Token').first()).toBeVisible()
      await expect(page.getByText('Disabled')).toBeVisible()
    },
  },
]

// ---------------------------------------------------------------------------
// Detail page tab entries
// ---------------------------------------------------------------------------
export const detailTabPages: PageEntry[] = [
  {
    section: 'settings',
    name: 'settings-application-tab',
    path: AppRoute.SystemAdministration.SettingsTab.replace(':category', 'application'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Application/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'configuration/credentials',
    name: 'credential-detail-workflows-tab',
    path: AppRoute.Configuration.Credentials.DetailTab.replace(':credentialId', MOCK_CREDENTIAL_ID).replace(
      ':tab',
      'workflows'
    ),
    waitFor: async (page) => {
      await expect(page.getByText('Production API Auth').first()).toBeVisible()
      await expect(page.getByRole('tab', { name: /Workflows/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'user-detail-groups-tab',
    path: AppRoute.AccessManagement.UserDetailTab.replace(':userId', MOCK_USER_ID).replace(':tab', 'groups'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Groups/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'user-detail-roles-tab',
    path: AppRoute.AccessManagement.UserDetailTab.replace(':userId', MOCK_USER_ID).replace(':tab', 'roles'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Assignments/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'access-management/groups',
    name: 'group-detail-members-tab',
    path: AppRoute.AccessManagement.GroupDetailTab.replace(':groupId', MOCK_GROUP_ID).replace(':tab', 'members'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Members/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'access-management/groups',
    name: 'group-detail-roles-tab',
    path: AppRoute.AccessManagement.GroupDetailTab.replace(':groupId', MOCK_GROUP_ID).replace(':tab', 'roles'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Assignments/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'access-management/projects',
    name: 'project-detail-role-assignments-tab',
    path: AppRoute.AccessManagement.ProjectDetailTab.replace(':projectId', MOCK_PROJECT_ID).replace(
      ':tab',
      'role-assignments'
    ),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Assignments/i, selected: true })).toBeVisible()
    },
  },
]
