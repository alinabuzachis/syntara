/**
 * E2E tests for workflow verification, publish blocking, and error indicators.
 *
 * Covers:
 *   - Verify button in toolbar
 *   - Validation error panel with Go to node
 *   - Error/warning indicators on canvas nodes
 *   - Block publish when validation errors exist
 *   - Save with warnings
 *   - Variable reference validation errors
 */

import AxeBuilder from '@axe-core/playwright'
import { type Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { WCAG_TAGS } from './fixtures/accessibility'
import {
  buildUniqueName,
  createBasicWorkflow,
  createWorkflowWithTrigger,
  addScriptNode,
  addScriptNodeUnconnected,
  deleteWorkflow,
} from './helpers/workflows'
import { deleteWorkflowViaApi } from './utils/api'

const VERIFY_BANNER_TIMEOUT = 10_000
const ERROR_BADGE_TIMEOUT = 5_000
const SAVE_URL_TIMEOUT = 15_000

const VALIDATE_ROUTE = '**/api/v1/workflows/validate'

function getWorkflowIdFromUrl(app: Page): string {
  const id = app.url().match(/workflow-builder\/([^/?]+)/)?.[1]
  expect(id).toBeTruthy()
  return id!
}

async function clickVerifyWorkflow(app: Page): Promise<void> {
  await app.getByRole('button', { name: 'Workflow actions' }).click()
  await app.getByRole('menuitem', { name: /verify workflow/i }).click()
}

type MockValidateOptions = {
  valid?: boolean
  errors?: Array<{ message: string; node_id?: string | null }>
  warnings?: Array<{ message: string; node_id?: string | null }>
}

async function mockValidateEndpoint(app: Page, options: MockValidateOptions = {}): Promise<void> {
  const { valid = true, errors = [], warnings = [] } = options
  await app.route(VALIDATE_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid, errors, warnings }),
    })
  )
}

test.describe('Verify button in toolbar', () => {
  test('verify action is visible in kebab menu', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-verify-visible')

    try {
      await createBasicWorkflow(app, workflowName, 'Verify step')

      await app.getByRole('button', { name: 'Workflow actions' }).click()
      await expect(app.getByRole('menuitem', { name: /verify workflow/i })).toBeVisible()

      await app.getByRole('button', { name: 'Workflow actions' }).click()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('verify displays validation errors', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-verify-errors')

    try {
      await createBasicWorkflow(app, workflowName, 'Error step')

      await clickVerifyWorkflow(app)

      await expect(app.getByText(/Verification failed/)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('verify displays success when workflow is valid', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-verify-success')

    try {
      await createBasicWorkflow(app, workflowName, 'Valid step')

      await mockValidateEndpoint(app)

      await clickVerifyWorkflow(app)

      await expect(app.getByText('Workflow definition is valid')).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })
    } finally {
      await app.unroute(VALIDATE_ROUTE)
      await deleteWorkflow(app, workflowName)
    }
  })
})

test.describe('Validation error panel', () => {
  test('error panel shows issue count', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-error-panel')

    try {
      await createBasicWorkflow(app, workflowName, 'Panel step')

      await clickVerifyWorkflow(app)

      const banner = app.getByText(/Verification failed — \d+ issues? found/)
      await expect(banner).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('error panel can be dismissed', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-error-dismiss')

    try {
      await createBasicWorkflow(app, workflowName, 'Dismiss step')

      await clickVerifyWorkflow(app)

      const banner = app.getByText(/Verification failed/)
      await expect(banner).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })

      const alert = app.getByRole('alert')
      await alert.getByRole('button', { name: /close/i }).click()

      await expect(banner).not.toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('clicking node name in error panel opens node editor', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-error-goto')
    const stepName = 'Goto step'

    try {
      await createBasicWorkflow(app, workflowName, stepName)

      await clickVerifyWorkflow(app)

      await expect(app.getByText(/Verification failed/)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })

      await app.getByRole('button', { name: /alert details/i }).click()

      const nodeLink = app.getByRole('button', { name: stepName })
      await expect(nodeLink).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })
      await nodeLink.click()

      await expect(app.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible({
        timeout: VERIFY_BANNER_TIMEOUT,
      })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})

test.describe('Error indicators on canvas nodes', () => {
  test('validation error badge appears on nodes with errors', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-error-badge')

    try {
      await createBasicWorkflow(app, workflowName, 'Badge step')

      await clickVerifyWorkflow(app)

      await expect(app.getByText(/Verification failed/)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })

      await expect(app.locator('[data-testid="validation-error-badge"]')).toHaveCount(1, {
        timeout: ERROR_BADGE_TIMEOUT,
      })
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})

test.describe('Block publish when validation errors exist', () => {
  test('publish button is disabled when validation errors exist', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-publish-blocked')

    try {
      await createBasicWorkflow(app, workflowName, 'Blocked step')

      await clickVerifyWorkflow(app)

      await expect(app.getByText(/Verification failed/)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })

      const publishButton = app.getByRole('button', { name: /publish workflow/i })
      await expect(publishButton).toHaveAttribute('aria-disabled', 'true')
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('publish button works when workflow is valid', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-publish-clean')

    try {
      await createBasicWorkflow(app, workflowName, 'Clean step')

      await mockValidateEndpoint(app)

      const publishButton = app.getByRole('button', { name: /publish workflow/i })
      await expect(publishButton).not.toHaveAttribute('aria-disabled', 'true')
      await publishButton.click()

      const dialog = app.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })
      await expect(dialog.getByText('Publish workflow?')).toBeVisible()

      await dialog.getByRole('button', { name: 'Cancel' }).click()
    } finally {
      await app.unroute(VALIDATE_ROUTE)
      await deleteWorkflow(app, workflowName)
    }
  })
})

test.describe('Save with warnings', () => {
  test('warnings are non-blocking for save and show warning banner', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-save-warnings')

    try {
      await createBasicWorkflow(app, workflowName, 'Warn step')

      await mockValidateEndpoint(app, {
        warnings: [{ message: 'Step has no downstream consumers', node_id: null }],
      })

      await clickVerifyWorkflow(app)

      const warningBanner = app.getByText(/Saved with 1 warning/)
      await expect(warningBanner).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })

      await expect(app.getByText(/Verification failed/)).not.toBeVisible()
    } finally {
      await app.unroute(VALIDATE_ROUTE)
      await deleteWorkflow(app, workflowName)
    }
  })
})

test.describe('Variable reference validation', () => {
  test('reference to nonexistent node shows validation error', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-varref-invalid')

    await createWorkflowWithTrigger(app, workflowName)
    const workflowId = getWorkflowIdFromUrl(app)

    try {
      await addScriptNode(app, 'Ref step', 'echo ${nonexistent_node.result}')

      await app.getByRole('button', { name: 'Save' }).click()
      await expect(app).toHaveURL(/workflow-builder\/.+/, { timeout: SAVE_URL_TIMEOUT })

      await clickVerifyWorkflow(app)

      await expect(app.getByText(/Verification failed/)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })

      await app.getByRole('button', { name: /alert details/i }).click()
      await expect(app.getByText(/does not exist in this workflow/i)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })
    } finally {
      await deleteWorkflowViaApi(app, workflowId)
    }
  })

  test('reference to existing node that is not upstream shows validation error', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-varref-upstream')

    await createWorkflowWithTrigger(app, workflowName)
    const workflowId = getWorkflowIdFromUrl(app)

    try {
      await addScriptNode(app, 'Upstream step', 'echo hello')

      const upstreamNode = app
        .locator('[role="group"][aria-roledescription="node"]')
        .filter({ hasText: 'Upstream step' })
      const upstreamNodeId = await upstreamNode.getAttribute('data-id')

      await addScriptNodeUnconnected(app, 'Isolated step', `echo \${${upstreamNodeId}.result}`)

      await app.getByRole('button', { name: 'Save' }).click()
      await expect(app).toHaveURL(/workflow-builder\/.+/, { timeout: SAVE_URL_TIMEOUT })

      await clickVerifyWorkflow(app)

      await expect(app.getByText(/Verification failed/)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })

      await app.getByRole('button', { name: /alert details/i }).click()
      await expect(app.getByText(/is not upstream of this step/i)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })
    } finally {
      await deleteWorkflowViaApi(app, workflowId)
    }
  })

  test('reference to undefined input field shows validation error', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-varref-field')

    await createWorkflowWithTrigger(app, workflowName)
    const workflowId = getWorkflowIdFromUrl(app)

    try {
      await addScriptNode(app, 'Field ref step', 'echo ${input.missing_field}')

      await app.getByRole('button', { name: 'Save' }).click()
      await expect(app).toHaveURL(/workflow-builder\/.+/, { timeout: SAVE_URL_TIMEOUT })

      await clickVerifyWorkflow(app)

      await expect(app.getByText(/Verification failed/)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })

      await app.getByRole('button', { name: /alert details/i }).click()
      await expect(app.getByText(/is not a defined input field/i)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })
    } finally {
      await deleteWorkflowViaApi(app, workflowId)
    }
  })
})

test.describe('Accessibility', () => {
  test('verification error panel has no accessibility violations', async ({ app }) => {
    const workflowName = buildUniqueName('e2e-accessibility-verify')

    try {
      await createBasicWorkflow(app, workflowName, 'A11y step')

      await clickVerifyWorkflow(app)

      await expect(app.getByText(/Verification failed/)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })

      const results = await new AxeBuilder({ page: app }).withTags([...WCAG_TAGS]).analyze()
      expect(results.violations).toEqual([])
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
})

test.describe('Empty workflow verification', () => {
  test('verify detects issues in trigger-only workflow with no steps', async ({ app }) => {
    test.setTimeout(90_000)
    const workflowName = buildUniqueName('e2e-verify-empty')

    await createWorkflowWithTrigger(app, workflowName)
    const workflowId = getWorkflowIdFromUrl(app)

    try {
      await clickVerifyWorkflow(app)

      await expect(app.getByText(/Verification failed/)).toBeVisible({ timeout: VERIFY_BANNER_TIMEOUT })
    } finally {
      await deleteWorkflowViaApi(app, workflowId)
    }
  })
})
