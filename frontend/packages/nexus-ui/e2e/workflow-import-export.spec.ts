/**
 * E2E Tests: Workflow Import/Export (AAP-76711)
 *
 * Comprehensive test coverage for workflow import/export flows, validating:
 * - Round-trip preservation (export -> import -> verify equivalence)
 * - Import from workflows list page
 * - Export from workflows list page
 * - Builder toolbar kebab menu import/export
 * - Node position round-trip (AAP-74997)
 * - Credential reference round-trip
 *
 * Related issues: AAP-73588, AAP-74997, AAP-64527
 */

import fs from 'node:fs/promises'

import type { V2WorkflowDefinition } from '@ansible/nexus-contracts'
import type { Page, Locator } from '@playwright/test'

import { test, expect, toAppUrl } from './fixtures'
import { createCredentialOfTypeViaUI, deleteCredentialByName, isCredentialsResponse } from './helpers/credentials'
import {
  buildUniqueName,
  createBasicWorkflow,
  deleteWorkflow,
  openWorkflowInBuilder,
  clickAddConnectedStep,
  selectProjectIfRequired,
  selectFirstProject,
  closeNodeEditorPanel,
  startWorkflowWithTrigger,
  saveWorkflow,
  verifyNodeVisible,
} from './helpers/workflows'
import { ensureProject } from './utils/api'

async function downloadAndParseWorkflow(
  page: Page,
  downloadTrigger: () => Promise<void>
): Promise<V2WorkflowDefinition> {
  const downloadPromise = page.waitForEvent('download')
  await downloadTrigger()
  const download = await downloadPromise
  const filePath = await download.path()
  if (!filePath) throw new Error('Download failed: no path returned')
  const content = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(content) as V2WorkflowDefinition
}

async function uploadWorkflowFile(fileInput: Locator, workflowDef: V2WorkflowDefinition): Promise<void> {
  const buffer = Buffer.from(JSON.stringify(workflowDef, null, 2))
  await fileInput.setInputFiles({
    name: 'workflow.json',
    mimeType: 'application/json',
    buffer,
  })
}

async function exportFromWorkflowsList(app: Page, workflowName: string): Promise<V2WorkflowDefinition> {
  await app.goto(toAppUrl('/workflows'))
  await app.getByPlaceholder('Filter by name').fill(workflowName)
  await app.getByRole('button', { name: 'Apply filter' }).click()

  return downloadAndParseWorkflow(app, async () => {
    const row = app.getByRole('row', { name: new RegExp(workflowName) })
    await row.getByRole('button', { name: /Kebab toggle|Actions/i }).click({ force: true })
    await app.getByRole('menuitem', { name: 'Export workflow' }).click()
  })
}

async function importFromWorkflowsList(
  app: Page,
  workflowDef: V2WorkflowDefinition,
  workflowName: string
): Promise<void> {
  await ensureProject(app)
  await selectFirstProject(app)

  await app.getByRole('button', { name: 'Import workflow' }).click()
  const dialog = app.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const fileInput = app.locator('input[type="file"]')
  await uploadWorkflowFile(fileInput, workflowDef)
  await dialog.getByLabel(/Workflow name/i).fill(workflowName)

  // If the dialog still shows "Select a project" (project didn't propagate
  // from the list page via Zustand under parallel load), select one now.
  const dialogProjectInput = dialog.getByPlaceholder('Select a project')
  if ((await dialogProjectInput.count()) > 0 && (await dialogProjectInput.isVisible())) {
    await selectFirstProject(app)
    if ((await dialogProjectInput.count()) > 0 && (await dialogProjectInput.isVisible())) {
      await dialogProjectInput.click()
      const realOption = app
        .getByRole('option')
        .filter({ hasNotText: /Create project|View more/ })
        .nth(0)
      await realOption.waitFor({ state: 'visible', timeout: 10_000 })
      await realOption.click()
    }
  }

  await dialog.getByRole('button', { name: /^Import$/i }).click()

  await expect(dialog).not.toBeVisible({ timeout: 15_000 })
}

test.describe('Workflow Import/Export', () => {
  test('AC #1: exports and re-imports a workflow with equivalent structure', async ({ app }) => {
    const workflowName = buildUniqueName('roundtrip')
    const reimportedName = `${workflowName}-reimported`

    try {
      await createBasicWorkflow(app, workflowName, 'Test action')
      const exportedDef = await exportFromWorkflowsList(app, workflowName)

      expect(Array.isArray(exportedDef.triggers)).toBe(true)
      expect(Array.isArray(exportedDef.nodes)).toBe(true)
      expect(Array.isArray(exportedDef.edges)).toBe(true)

      await importFromWorkflowsList(app, exportedDef, reimportedName)

      await app.getByRole('button', { name: reimportedName, exact: true }).click()
      await expect(app.getByPlaceholder('Workflow name')).toHaveValue(reimportedName)

      const reexportedDef = await downloadAndParseWorkflow(app, async () => {
        await app.getByLabel('Workflow actions').click()
        await app.getByRole('menuitem', { name: 'Export workflow' }).click()
      })

      expect(reexportedDef.triggers).toEqual(exportedDef.triggers)
      expect(reexportedDef.nodes).toEqual(exportedDef.nodes)
      expect(reexportedDef.edges).toEqual(exportedDef.edges)
    } finally {
      await deleteWorkflow(app, workflowName)
      await deleteWorkflow(app, reimportedName)
    }
  })

  test('AC #2: imports a workflow from the workflows list page', async ({ app }) => {
    const workflowName = buildUniqueName('import-list')
    const workflowDef = {
      triggers: [{ type: 'manual_trigger', name: 'Manual trigger' }],
      nodes: [{ id: 'n1', type: 'script', name: 'Script', config: { code: 'print("test")' } }],
      edges: [{ from: 'triggers/0', to: 'n1' }],
    } as unknown as V2WorkflowDefinition

    try {
      await app.goto(toAppUrl('/workflows'))
      await importFromWorkflowsList(app, workflowDef, workflowName)
      await app.getByPlaceholder('Filter by name').fill(workflowName)
      await app.getByRole('button', { name: 'Apply filter' }).click()
      await expect(app.getByRole('button', { name: workflowName, exact: true })).toBeVisible()
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('AC #3: exports a workflow from the workflows list page', async ({ app }) => {
    const workflowName = buildUniqueName('export-list')
    try {
      await createBasicWorkflow(app, workflowName, 'Action 1')
      const exportedDef = await exportFromWorkflowsList(app, workflowName)
      expect(Array.isArray(exportedDef.triggers)).toBe(true)
      expect(Array.isArray(exportedDef.nodes)).toBe(true)
      expect(Array.isArray(exportedDef.edges)).toBe(true)
      expect(exportedDef.triggers.length).toBeGreaterThan(0)
      expect(exportedDef.nodes.length).toBeGreaterThan(0)
      expect(exportedDef.edges.length).toBeGreaterThan(0)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('AC #4a: imports a workflow from the builder toolbar kebab menu', async ({ app }) => {
    const workflowName = buildUniqueName('import-builder')
    const workflowDef = {
      triggers: [{ type: 'manual_trigger', name: 'Imported Trigger' }],
      nodes: [{ id: 'n1', type: 'script', name: 'Imported Script', config: { code: 'print("imported")' } }],
      edges: [{ from: 'triggers/0', to: 'n1' }],
    } as unknown as V2WorkflowDefinition

    try {
      await app.goto(toAppUrl('/workflow-builder/new'))
      await selectProjectIfRequired(app)

      const fileInput = app.locator('input[type="file"][accept=".json"]')
      await uploadWorkflowFile(fileInput, workflowDef)
      await app.getByLabel('Workflow actions').click()
      await app.getByRole('menuitem', { name: 'Import workflow' }).click()

      await verifyNodeVisible(app, 'Imported Trigger')
      await verifyNodeVisible(app, 'Imported Script')

      await saveWorkflow(app, workflowName)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('AC #4b: exports a workflow from the builder toolbar kebab menu', async ({ app }) => {
    const workflowName = buildUniqueName('export-builder')
    try {
      await createBasicWorkflow(app, workflowName, 'Builder Action')
      await openWorkflowInBuilder(app, workflowName)
      const exportedDef = await downloadAndParseWorkflow(app, async () => {
        await app.getByLabel('Workflow actions').click()
        await app.getByRole('menuitem', { name: 'Export workflow' }).click()
      })
      expect(exportedDef).toHaveProperty('triggers')
      expect(exportedDef).toHaveProperty('nodes')
      expect(exportedDef).toHaveProperty('edges')
      expect(exportedDef.nodes.some((n) => n.name === 'Builder Action')).toBe(true)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('AC #5: preserves node positions during export and import', async ({ app }) => {
    const workflowName = buildUniqueName('positions')
    const workflowWithPositions = {
      triggers: [
        { id: 'manual_trigger_0', type: 'manual_trigger', name: 'Manual trigger', position: { x: 100, y: 200 } },
      ],
      nodes: [
        {
          id: 'n1',
          type: 'script',
          name: 'Positioned Script',
          config: { code: 'print("positioned")' },
          position: { x: 400, y: 300 },
        },
      ],
      edges: [{ from: 'triggers/0', to: 'n1' }],
    } as unknown as V2WorkflowDefinition

    try {
      await app.goto(toAppUrl('/workflow-builder/new'))
      await selectProjectIfRequired(app)

      const fileInput = app.locator('input[type="file"][accept=".json"]')
      await uploadWorkflowFile(fileInput, workflowWithPositions)
      await app.getByLabel('Workflow actions').click()
      await app.getByRole('menuitem', { name: 'Import workflow' }).click()

      await verifyNodeVisible(app, 'Manual trigger')
      await verifyNodeVisible(app, 'Positioned Script')

      const exportedDef = await downloadAndParseWorkflow(app, async () => {
        await app.getByLabel('Workflow actions').click()
        await app.getByRole('menuitem', { name: 'Export workflow' }).click()
      })

      expect(exportedDef.triggers[0].position).toEqual(workflowWithPositions.triggers[0].position)
      const scriptNode = exportedDef.nodes.find((n) => n.name === 'Positioned Script')
      expect(scriptNode).toBeDefined()
      expect(scriptNode?.position).toEqual(workflowWithPositions.nodes[0].position)

      await saveWorkflow(app, workflowName)
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })

  test('AC #6: preserves credential references during export and import', async ({ app }) => {
    const workflowName = buildUniqueName('cred-roundtrip')
    const reimportedName = `${workflowName}-reimported`
    const credName = buildUniqueName('e2e-cred')

    try {
      await createCredentialOfTypeViaUI(app, {
        name: credName,
        type: 'HTTP Bearer Token',
        fields: { Token: 'e2e-test-token' },
      })

      await startWorkflowWithTrigger(app)
      const credentialsLoaded = app.waitForResponse(isCredentialsResponse)
      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Action', exact: true }).click()
      await panel.getByRole('button', { name: 'REST API', exact: true }).click()

      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('API Call')
      await app.getByLabel('URL').fill('https://api.example.com/test')
      await credentialsLoaded

      const credToggle = app.getByRole('button', { name: 'Authentication credential', exact: true })
      await expect(credToggle).toBeEnabled({ timeout: 10_000 })
      await credToggle.click()
      const credOption = app.getByRole('option', { name: credName, exact: true })
      await credOption.waitFor({ state: 'visible', timeout: 15_000 })
      await credOption.click()
      await expect(credToggle).toContainText(credName)

      await app.getByRole('button', { name: 'Save and close' }).click()
      await closeNodeEditorPanel(app)
      await saveWorkflow(app, workflowName)

      const exportedDef = await exportFromWorkflowsList(app, workflowName)
      const apiNode = exportedDef.nodes.find((n) => n.type === 'http_request')
      expect(apiNode).toBeDefined()
      expect(apiNode?.config).toHaveProperty('credential_id')

      await importFromWorkflowsList(app, exportedDef, reimportedName)

      await app.getByRole('button', { name: reimportedName, exact: true }).click()
      const reloadedCredentialsLoaded = app.waitForResponse(isCredentialsResponse)
      await app.getByText('API Call').click()
      await reloadedCredentialsLoaded

      const reloadedCredToggle = app.getByRole('button', { name: 'Authentication credential', exact: true })
      await expect(reloadedCredToggle).toContainText(credName, { timeout: 10_000 })
    } finally {
      await deleteWorkflow(app, workflowName)
      await deleteWorkflow(app, reimportedName)
      await deleteCredentialByName(app, credName)
    }
  })
})
