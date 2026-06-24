/**
 * Interactive-state page entries for visual regression testing.
 *
 * These entries cover builder interaction states, detail page tabs,
 * status variants, dialog states, and other interactive UI states
 * that extend the base page coverage in page-registry.ts.
 */
import { expect, type Page } from '@playwright/test'

import { AppRoute } from '../../src/app/AppRoute'

import { MOCK_IDENTITY_PROVIDER_ID } from './mock-ids'
import type { PageEntry } from './page-registry'

/**
 * Opens the step editor side panel by clicking the canvas card title (PatternFly `Title` h2).
 * Prefer this over `getByTestId('rf__node-…')` + `force: true`, which often selects the card
 * without opening the editor (seed workflows may lack `name`, so the h2 shows the executor label).
 */
async function openStepEditorFromCanvasTitle(page: Page, title: string | RegExp) {
  const canvas = page.locator('.react-flow')
  await canvas.getByRole('heading', { name: title, level: 2 }).first().click()
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible({
    timeout: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Mock API IDs for interactive state entries
// ---------------------------------------------------------------------------
const MOCK_WORKFLOW_ID = '1'
const MOCK_CONDITION_WORKFLOW_ID = '6'
const MOCK_LOOP_WORKFLOW_ID = '3'
const MOCK_AGENTIC_WORKFLOW_ID = '48'
const MOCK_HTTP_WORKFLOW_ID = '49'
const MOCK_CONVERGE_WORKFLOW_ID = '52'
const MOCK_APPROVAL_WORKFLOW_ID = '53'
const MOCK_EXECUTION_FAILED_ID = 'exec-3'
const MOCK_EXECUTION_RUNNING_ID = 'exec-4'
const MOCK_EXECUTION_PAUSED_ID = 'exec-6'
const MOCK_EXECUTION_CANCELLED_ID = 'exec-8'
const MOCK_EXECUTION_PENDING_ID = 'exec-10'
const MOCK_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const MOCK_GROUP_ID = 'g1a2b3c4-d5e6-7890-abcd-ef1234567890'
const MOCK_PROJECT_ID = 'p-001'
const MOCK_CREDENTIAL_ID = 'cred-001'
const MOCK_CREDENTIAL_DISABLED_ID = 'cred-003'
const MOCK_APPROVAL_ID = '550e8400-e29b-41d4-a716-446655440050'
const MOCK_APPROVAL_EXECUTION_ID = 'exec-approval'
// ---------------------------------------------------------------------------
// Transfer Identity Wizard states
// ---------------------------------------------------------------------------
export const transferIdentityWizardPages: PageEntry[] = [
  {
    section: 'access-management/users',
    name: 'transfer-identity-wizard-step1',
    path: AppRoute.AccessManagement.TransferIdentity.replace(':userId', MOCK_USER_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: /Transfer identity to/i })).toBeVisible()
      await expect(page.getByRole('heading', { level: 2, name: 'Select a user' })).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'transfer-identity-wizard-step1-selected',
    path: AppRoute.AccessManagement.TransferIdentity.replace(':userId', MOCK_USER_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 2, name: 'Select a user' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.locator('table tbody tr').first().click()
      await expect(page.getByRole('radio', { checked: true })).toBeVisible()
    },
  },
  {
    section: 'access-management/users',
    name: 'transfer-identity-wizard-step2-empty',
    path: AppRoute.AccessManagement.TransferIdentity.replace(':userId', MOCK_USER_ID),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 2, name: 'Select a user' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.locator('table tbody tr').first().click()
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Select an identity' })).toBeVisible()
    },
  },
]

// ---------------------------------------------------------------------------
// OIDC Provider Wizard — additional section / step states
// ---------------------------------------------------------------------------
export const oidcProviderWizardPages: PageEntry[] = [
  {
    section: 'authentication',
    name: 'identity-provider-add-connection-section',
    path: AppRoute.SystemAdministration.Authentication.AddIdentityProvider,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Add OIDC provider' })).toBeVisible()
    },
    setup: async (page) => {
      const connectionHeading = page.getByRole('heading', { name: 'Connection', level: 3 })
      await connectionHeading.scrollIntoViewIfNeeded()
      await expect(connectionHeading).toBeVisible()
    },
  },
  {
    section: 'authentication',
    name: 'identity-provider-add-options-section',
    path: AppRoute.SystemAdministration.Authentication.AddIdentityProvider,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Add OIDC provider' })).toBeVisible()
    },
    setup: async (page) => {
      const optionsHeading = page.getByRole('heading', { name: 'Options', level: 3 })
      await optionsHeading.scrollIntoViewIfNeeded()
      await expect(optionsHeading).toBeVisible()
    },
  },
  {
    section: 'authentication',
    name: 'identity-provider-edit',
    path: AppRoute.SystemAdministration.Authentication.EditIdentityProvider.replace(
      ':providerId',
      MOCK_IDENTITY_PROVIDER_ID
    ),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: /Edit OIDC provider/i })).toBeVisible()
    },
  },
  {
    section: 'authentication',
    name: 'identity-provider-detail-group-mapping-tab',
    path: AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(
      ':providerId',
      MOCK_IDENTITY_PROVIDER_ID
    ),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('tab', { name: /Group mapping/i }).click()
      await expect(page.getByRole('tab', { name: /Group mapping/i })).toHaveAttribute('aria-selected', 'true')
    },
  },
  {
    section: 'authentication',
    name: 'identity-provider-detail-disable-dialog',
    path: AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(
      ':providerId',
      MOCK_IDENTITY_PROVIDER_ID
    ),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
    setup: async (page) => {
      await page.locator('#provider-detail-toggle').click({ force: true })
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: /Disable/i })).toBeVisible()
    },
  },
  {
    section: 'authentication',
    name: 'identity-provider-detail-kebab-menu',
    path: AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(
      ':providerId',
      MOCK_IDENTITY_PROVIDER_ID
    ),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: /Actions|Kebab toggle/i }).click()
      await expect(page.getByRole('menuitem', { name: /Delete/i })).toBeVisible()
    },
  },
  {
    section: 'authentication',
    name: 'identity-provider-add-step1-validation',
    path: AppRoute.SystemAdministration.Authentication.AddIdentityProvider,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Add OIDC provider' })).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Next' }).click()
      await expect(page.getByText(/required/i).first()).toBeVisible()
    },
  },
]

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
    section: 'workflows',
    name: 'builder-edit-script-node-form',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_CONDITION_WORKFLOW_ID),
    perceptual: true,
    maxDiffPixelRatio: 0.05,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      await openStepEditorFromCanvasTitle(page, /Adult Message/i)
    },
  },
  {
    section: 'workflows',
    name: 'builder-edit-condition-node-form',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_CONDITION_WORKFLOW_ID),
    perceptual: true,
    maxDiffPixelRatio: 0.05,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      await openStepEditorFromCanvasTitle(page, /Check Age/i)
    },
  },
  {
    section: 'workflows',
    name: 'builder-edit-loop-node-form',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_LOOP_WORKFLOW_ID),
    perceptual: true,
    maxDiffPixelRatio: 0.05,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      await openStepEditorFromCanvasTitle(page, 'Loop')
      // Verify the loop form loaded (not a child step's form)
      await expect(page.getByLabel('Type', { exact: true })).toHaveValue(/while|forEach/)
    },
  },
  {
    section: 'workflows',
    name: 'builder-edit-agentic-node-form',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_AGENTIC_WORKFLOW_ID),
    perceptual: true,
    maxDiffPixelRatio: 0.05,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      // simple-research agentic activity has no display name — card title is executor label "Agentic"
      await openStepEditorFromCanvasTitle(page, 'Agentic')
    },
  },
  {
    section: 'workflows',
    name: 'builder-edit-http-node-form',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_HTTP_WORKFLOW_ID),
    perceptual: true,
    maxDiffPixelRatio: 0.05,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      // simple-get-request http activity has no display name — card title is executor label "REST API"
      await openStepEditorFromCanvasTitle(page, 'REST API')
    },
  },
  {
    section: 'workflows',
    name: 'builder-edit-converge-node-form',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_CONVERGE_WORKFLOW_ID),
    perceptual: true,
    maxDiffPixelRatio: 0.05,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      await openStepEditorFromCanvasTitle(page, 'Converge')
    },
  },
  {
    section: 'workflows',
    name: 'builder-edit-approval-node-form',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_APPROVAL_WORKFLOW_ID),
    perceptual: true,
    maxDiffPixelRatio: 0.05,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      await openStepEditorFromCanvasTitle(page, /Deployment Approval/i)
    },
  },
  {
    section: 'workflows',
    name: 'builder-new-scheduled-trigger-form',
    path: AppRoute.WorkflowBuilder.New,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible({
        timeout: 30_000,
      })
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Schedule trigger' }).click()
      const scheduleType = page.getByLabel('Schedule type')
      await expect(scheduleType).toBeVisible()
      await scheduleType.selectOption('interval')
      await expect(page.getByLabel('Start date')).toBeVisible()
      await expect(page.getByLabel('Hour')).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'builder-new-webhook-trigger-form',
    path: AppRoute.WorkflowBuilder.New,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible({
        timeout: 30_000,
      })
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Webhook trigger' }).click()
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'builder-new-manual-trigger-form',
    path: AppRoute.WorkflowBuilder.New,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible({
        timeout: 30_000,
      })
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Manual trigger' }).click()
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'builder-new-verify-errors',
    path: AppRoute.WorkflowBuilder.New,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Workflow actions' }).click()
      await page.getByRole('menuitem', { name: 'Verify workflow' }).click()
      await expect(page.getByText('Verification failed')).toBeVisible({ timeout: 10_000 })
    },
  },
  {
    section: 'workflows',
    name: 'builder-edit-verify-node-errors',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_WORKFLOW_ID),
    perceptual: true,
    maxDiffPixelRatio: 0.05,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Workflow actions' }).click()
      await page.getByRole('menuitem', { name: 'Verify workflow' }).click()
      await expect(page.getByText('Verification failed')).toBeVisible({ timeout: 10_000 })
    },
  },
]

// ---------------------------------------------------------------------------
// Workflow dialog entries (publish, unpublish, run, kebab menu)
// ---------------------------------------------------------------------------
export const workflowDialogPages: PageEntry[] = [
  {
    section: 'workflows',
    name: 'workflows-kebab-menu',
    path: AppRoute.Workflows.Root,
    waitFor: async (page) => {
      await expect(page.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      const kebab = page.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await kebab.click()
      await expect(page.getByRole('menuitem', { name: /Edit workflow/i })).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'workflows-publish-dialog',
    path: AppRoute.Workflows.Root,
    waitFor: async (page) => {
      await expect(page.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      const kebab = page.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await kebab.click()
      await page.getByRole('menuitem', { name: 'Publish workflow', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Publish workflow?')).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'workflows-unpublish-dialog',
    path: AppRoute.Workflows.Root,
    waitFor: async (page) => {
      await expect(page.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      // Find a workflow row that has a published version and open its kebab
      const kebab = page.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await kebab.click()
      // The unpublish option only appears for published workflows; if absent, click publish first
      const unpublishItem = page.getByRole('menuitem', { name: /Unpublish workflow/i })
      const hasUnpublish = await unpublishItem.isVisible().catch(() => false)
      if (hasUnpublish) {
        await unpublishItem.click()
      } else {
        // Close menu and try publishing first so the unpublish item appears
        await page.keyboard.press('Escape')
        await kebab.click()
        await page.getByRole('menuitem', { name: /Publish workflow/i }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByRole('button', { name: 'Publish' }).click()
        await expect(page.getByRole('dialog')).not.toBeVisible()
        await kebab.click()
        const unpublishAfterPublish = page.getByRole('menuitem', { name: /Unpublish workflow/i })
        await expect(unpublishAfterPublish).toBeVisible()
        await unpublishAfterPublish.click()
      }
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Unpublish workflow?')).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'workflows-run-dialog',
    path: AppRoute.Workflows.Root,
    waitFor: async (page) => {
      await expect(page.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      const kebab = page.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await kebab.click()
      await page.getByRole('menuitem', { name: /Run workflow/i }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: /Run/i })).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'builder-edit-version-history-panel',
    path: AppRoute.WorkflowBuilder.Edit.replace(':workflowId', MOCK_WORKFLOW_ID),
    perceptual: true,
    waitFor: async (page) => {
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 10_000 })
    },
    setup: async (page) => {
      await page.getByRole('button', { name: /Workflow actions/i }).click()
      await page.getByRole('menuitem', { name: /Version history/i }).click()
      await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible()
    },
  },
  {
    section: 'workflows',
    name: 'workflows-import-dialog',
    path: AppRoute.Workflows.Root,
    waitFor: async (page) => {
      await expect(page.getByText('Workflows', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: /Import workflow/i }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: /Import/i })).toBeVisible()
    },
  },
]

// ---------------------------------------------------------------------------
// Credential dialog entries (delete, disable from detail page)
// ---------------------------------------------------------------------------
export const credentialDialogPages: PageEntry[] = [
  {
    section: 'configuration/credentials',
    name: 'credentials-delete-dialog',
    path: AppRoute.Configuration.Credentials.Root,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      const kebab = page.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await kebab.click()
      await page.getByRole('menuitem', { name: /Delete/i }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: /Delete/i })).toBeVisible()
    },
  },
  {
    section: 'configuration/credentials',
    name: 'credentials-disable-dialog',
    path: AppRoute.Configuration.Credentials.Root,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page.locator('label[for="credential-toggle-cred-001"]').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: /Disable/i })).toBeVisible()
    },
  },
]

// ---------------------------------------------------------------------------
// Integration dialog entries (disconnect)
// ---------------------------------------------------------------------------
export const integrationDialogPages: PageEntry[] = [
  {
    section: 'configuration/integrations',
    name: 'integrations-disconnect-dialog',
    path: AppRoute.Configuration.Integrations.Root,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      const kebab = page.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await kebab.click()
      await page.getByRole('menuitem', { name: /Disconnect/i }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: /Disconnect/i })).toBeVisible()
    },
  },
]

// ---------------------------------------------------------------------------
// Approvals interactive entries (bulk selection toolbar)
// ---------------------------------------------------------------------------
/**
 * Wait for the approval side panel to open on the execution detail page.
 *
 * The panel opens when the `?approval=<id>` query param triggers a fetch
 * and the React hook processes the response. The execution must reference
 * a workflow that contains the matching approval node (approval_gate).
 */
async function waitForApprovalPanel(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Review Approval' })).toBeVisible({ timeout: 15_000 })
}

export const approvalInteractivePages: PageEntry[] = [
  // ── Approval Side Panel (shown in execution detail via deep-link) ─────
  {
    section: 'approvals',
    name: 'approval-side-panel-pending',
    path: `${AppRoute.Executions.Execution.replace(':executionId', MOCK_APPROVAL_EXECUTION_ID)}?approval=${MOCK_APPROVAL_ID}&history=closed`,
    waitFor: waitForApprovalPanel,
  },
  {
    section: 'approvals',
    name: 'approval-side-panel-approve-selected',
    path: `${AppRoute.Executions.Execution.replace(':executionId', MOCK_APPROVAL_EXECUTION_ID)}?approval=${MOCK_APPROVAL_ID}&history=closed`,
    waitFor: waitForApprovalPanel,
    setup: async (page) => {
      // Wait for permission checks to complete before clicking
      await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Approve' }).click()
      await expect(page.getByRole('button', { name: 'Submit decision' })).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approval-side-panel-reject-selected',
    path: `${AppRoute.Executions.Execution.replace(':executionId', MOCK_APPROVAL_EXECUTION_ID)}?approval=${MOCK_APPROVAL_ID}&history=closed`,
    waitFor: waitForApprovalPanel,
    setup: async (page) => {
      // Wait for permission checks to complete before clicking
      await expect(page.getByRole('button', { name: 'Reject' })).toBeEnabled({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Reject' }).click()
      await expect(page.getByRole('button', { name: 'Submit decision' })).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approval-side-panel-viewer-disabled',
    path: `${AppRoute.Executions.Execution.replace(':executionId', MOCK_APPROVAL_EXECUTION_ID)}?approval=${MOCK_APPROVAL_ID}&history=closed`,
    role: 'viewer',
    waitFor: async (page) => {
      await waitForApprovalPanel(page)
      await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
    },
  },
]

// ---------------------------------------------------------------------------
// Settings tab entries (additional categories beyond Application)
// ---------------------------------------------------------------------------
export const settingsTabPages: PageEntry[] = [
  {
    section: 'settings',
    name: 'settings-ai-llm-tab',
    path: AppRoute.SystemAdministration.SettingsTab.replace(':category', 'ai_llm'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('tab', { name: /AI \/ LLM/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'settings',
    name: 'settings-system-tab',
    path: AppRoute.SystemAdministration.SettingsTab.replace(':category', 'system'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('tab', { name: /System/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'settings',
    name: 'settings-authentication-tab',
    path: AppRoute.SystemAdministration.SettingsTab.replace(':category', 'authentication'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Authentication/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'settings',
    name: 'settings-workflow-execution-tab',
    path: AppRoute.SystemAdministration.SettingsTab.replace(':category', 'workflow_execution'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Workflow Execution/i, selected: true })).toBeVisible()
    },
  },
  {
    section: 'settings',
    name: 'settings-context-manager-tab',
    path: AppRoute.SystemAdministration.SettingsTab.replace(':category', 'context_manager'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Context Manager/i, selected: true })).toBeVisible()
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
    maxDiffPixelRatio: 0.02,
    path: AppRoute.Executions.Execution.replace(':executionId', MOCK_EXECUTION_FAILED_ID),
    perceptual: true,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('heading', { name: /run failed/i })).toBeVisible()
    },
  },
  {
    section: 'executions',
    name: 'execution-detail-running',
    maxDiffPixelRatio: 0.02,
    path: AppRoute.Executions.Execution.replace(':executionId', MOCK_EXECUTION_RUNNING_ID),
    perceptual: true,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Running', { exact: true }).first()).toBeVisible()
    },
  },
  {
    section: 'executions',
    name: 'execution-detail-paused',
    path: AppRoute.Executions.Execution.replace(':executionId', MOCK_EXECUTION_PAUSED_ID),
    perceptual: true,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Paused', { exact: true }).first()).toBeVisible()
    },
  },
  {
    section: 'executions',
    name: 'execution-detail-cancelled',
    path: AppRoute.Executions.Execution.replace(':executionId', MOCK_EXECUTION_CANCELLED_ID),
    perceptual: true,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible()
    },
  },
  {
    section: 'executions',
    name: 'execution-detail-pending',
    path: AppRoute.Executions.Execution.replace(':executionId', MOCK_EXECUTION_PENDING_ID),
    perceptual: true,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible()
    },
  },
  {
    section: 'approvals',
    name: 'approvals-expanded-row',
    path: AppRoute.Approvals.Root,
    waitFor: async (page) => {
      await expect(page.getByText('Approvals', { exact: true }).first()).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      await page
        .getByRole('button', { name: /details/i })
        .first()
        .click()
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
// User create form states
// ---------------------------------------------------------------------------
export const userCreateFormPages: PageEntry[] = [
  {
    section: 'access-management/users',
    name: 'user-create-validation-errors',
    path: AppRoute.AccessManagement.CreateUser,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { name: 'Create User' })).toBeVisible()
    },
    setup: async (page) => {
      await page.getByRole('button', { name: 'Create user' }).click()
      await expect(page.getByText(/required/i).first()).toBeVisible()
      await expect(page.getByRole('textbox', { name: /username/i })).toHaveAttribute('aria-invalid', 'true')
    },
  },
]

// ---------------------------------------------------------------------------
// Credential edit modal
// ---------------------------------------------------------------------------
export const credentialEditPages: PageEntry[] = [
  {
    section: 'configuration/credentials',
    name: 'credentials-edit-modal',
    path: AppRoute.Configuration.Credentials.Root,
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible()
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    },
    setup: async (page) => {
      const kebab = page.getByRole('button', { name: /Actions|Kebab toggle/i }).first()
      await kebab.click()
      await page.getByRole('menuitem', { name: /Edit/i }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('button', { name: /Save/i })).toBeVisible()
    },
  },
]

// ---------------------------------------------------------------------------
// Authentication interactive states
// ---------------------------------------------------------------------------
export const authenticationInteractivePages: PageEntry[] = [
  {
    section: 'authentication',
    name: 'identity-provider-detail',
    path: AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(
      ':providerId',
      MOCK_IDENTITY_PROVIDER_ID
    ),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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
    name: 'user-detail-identities-tab',
    path: AppRoute.AccessManagement.UserDetailTab.replace(':userId', MOCK_USER_ID).replace(':tab', 'identities'),
    waitFor: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Identities/i, selected: true })).toBeVisible()
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
