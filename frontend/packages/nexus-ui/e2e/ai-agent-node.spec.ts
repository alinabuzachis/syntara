import { type Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { type SeededLlmIntegration, createLlmIntegration, deleteLlmIntegration } from './helpers/llm-helpers'
import { ensureLlmCredential, selectLlmCredential } from './helpers/v2-nodes'
import {
  buildUniqueName,
  clickAddConnectedStep,
  closeNodeEditorPanel,
  deleteWorkflow,
  fillCodeEditor,
  openNodeForEditing,
  openWorkflowInBuilder,
  saveWorkflow,
  startWorkflowWithTrigger,
} from './helpers/workflows'
import { createIntegrationViaApi, deleteIntegrationViaApi, type SeededIntegration } from './seeds/resources'
import { getAuthToken } from './utils/api'

function canvasNode(app: Page, name: string) {
  return app.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: name })
}

test.describe('AI Agent Node @pr-check', () => {
  test('can create AI Agent node with model and credential', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-llm-integ')
    let integration: SeededLlmIntegration | undefined
    try {
      integration = await createLlmIntegration(app, integrationName)
      const { name: credName } = await ensureLlmCredential(app)

      await startWorkflowWithTrigger(app)

      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Task Agent' }).click()

      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('TestAgent')
      await app.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Analyze the input data')
      await selectLlmCredential(app, credName)

      await app.getByRole('button', { name: 'Create' }).click()
      await expect(app.getByRole('button', { name: 'Create' })).not.toBeAttached({ timeout: 15_000 })

      await expect(canvasNode(app, 'TestAgent')).toBeVisible()
    } finally {
      if (integration) await deleteLlmIntegration(app, integration.id)
    }
  })

  test('AI Agent node persists prompt after save/reload', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-llm-integ')
    const workflowName = buildUniqueName('e2e-agent-prompt')
    let integration: SeededLlmIntegration | undefined
    try {
      integration = await createLlmIntegration(app, integrationName)
      const { name: credName } = await ensureLlmCredential(app)

      await startWorkflowWithTrigger(app)

      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Task Agent' }).click()

      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('PromptAgent')
      await app.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Analyze this data')
      await selectLlmCredential(app, credName)

      await app.getByRole('button', { name: 'Create' }).click()
      await closeNodeEditorPanel(app)
      await saveWorkflow(app, workflowName)

      await openWorkflowInBuilder(app, workflowName)
      await openNodeForEditing(app, 'PromptAgent')

      const form = app.getByTestId('ai-agent-node-form')
      await expect(form).toBeVisible({ timeout: 10_000 })
      await expect(form.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue('Analyze this data', {
        timeout: 30_000,
      })
    } finally {
      await deleteWorkflow(app, workflowName)

      if (integration) await deleteLlmIntegration(app, integration.id)
    }
  })

  test('AI Agent node form shows models grouped by integration', async ({ app }) => {
    const integrationName1 = buildUniqueName('e2e-llm-integ-a')
    const integrationName2 = buildUniqueName('e2e-llm-integ-b')
    let integration1: SeededLlmIntegration | undefined
    let integration2: SeededLlmIntegration | undefined
    try {
      integration1 = await createLlmIntegration(app, integrationName1)
      integration2 = await createLlmIntegration(app, integrationName2)

      await startWorkflowWithTrigger(app)

      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Task Agent' }).click()

      const modelToggle = app.getByRole('button', { name: 'Model', exact: true })
      await expect(modelToggle).toBeEnabled({ timeout: 10_000 })
      await modelToggle.click()

      await expect(app.getByText(integration1.name)).toBeVisible({ timeout: 15_000 })
      await expect(app.getByText(integration2.name)).toBeVisible()

      await app.keyboard.press('Escape')
    } finally {
      if (integration1) await deleteLlmIntegration(app, integration1.id)
      if (integration2) await deleteLlmIntegration(app, integration2.id)
    }
  })

  test('AI Agent node with response schema persists after save/reload', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-llm-integ')
    const workflowName = buildUniqueName('e2e-agent-schema')
    let integration: SeededLlmIntegration | undefined
    try {
      integration = await createLlmIntegration(app, integrationName)
      const { name: credName } = await ensureLlmCredential(app)

      await startWorkflowWithTrigger(app)

      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Task Agent' }).click()

      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('SchemaAgent')
      await app.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Generate structured output')
      await selectLlmCredential(app, credName)

      const validSchema = JSON.stringify({
        type: 'object',
        properties: {
          summary: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['summary'],
      })
      await fillCodeEditor(app, { value: validSchema, label: 'Response schema editor' })

      await app.getByRole('button', { name: 'Create' }).click()
      await closeNodeEditorPanel(app)
      await saveWorkflow(app, workflowName)

      await openWorkflowInBuilder(app, workflowName)
      await openNodeForEditing(app, 'SchemaAgent')

      const form = app.getByTestId('ai-agent-node-form')
      await expect(form).toBeVisible({ timeout: 10_000 })

      const codeEditor = app.getByTestId('inline-code-editor')
      await expect(codeEditor).toBeVisible({ timeout: 10_000 })
      await expect(codeEditor).toContainText('summary', { timeout: 30_000 })
    } finally {
      await deleteWorkflow(app, workflowName)

      if (integration) await deleteLlmIntegration(app, integration.id)
    }
  })

  test('AI Agent node with tool selection and response schema persists after save/reload', async ({ app }) => {
    const llmIntegrationName = buildUniqueName('e2e-llm-integ')
    const mcpIntegrationName = buildUniqueName('e2e-mcp-integ')
    const workflowName = buildUniqueName('e2e-agent-tools-schema')
    let llmIntegration: SeededLlmIntegration | undefined
    let mcpIntegration: SeededIntegration | null = null
    try {
      llmIntegration = await createLlmIntegration(app, llmIntegrationName)
      // Tool selection requires an MCP integration (with tools). Without one the
      // Tools control stays empty and hides "All tools".
      const token = await getAuthToken(app)
      mcpIntegration = await createIntegrationViaApi(app, {
        name: mcpIntegrationName,
        token: token ?? undefined,
        discoveredTools: [{ name: 'e2e_search_tool', enabled: true }],
      })
      expect(mcpIntegration).not.toBeNull()

      const { name: credName } = await ensureLlmCredential(app)

      await startWorkflowWithTrigger(app)

      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Task Agent' }).click()

      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('ToolsSchemaAgent')
      await app
        .getByRole('textbox', { name: 'Prompt', exact: true })
        .fill('Generate structured output with tools available')
      await selectLlmCredential(app, credName)

      // Configure ALL tool selection (non-default) so persistence is meaningful.
      const toolsInput = app.getByRole('textbox', { name: 'Select tools' })
      await expect(toolsInput).toHaveValue('No tools selected', { timeout: 15_000 })
      await toolsInput.click()
      const allToolsCheckbox = app.getByRole('checkbox', { name: 'All tools' })
      await expect(allToolsCheckbox).toBeVisible({ timeout: 15_000 })
      await allToolsCheckbox.click()
      await app.keyboard.press('Escape')
      await expect(toolsInput).toHaveValue('All tools selected')

      const validSchema = JSON.stringify({
        type: 'object',
        properties: {
          summary: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['summary'],
      })
      await fillCodeEditor(app, { value: validSchema, label: 'Response schema editor' })

      await app.getByRole('button', { name: 'Create' }).click()
      await closeNodeEditorPanel(app)
      await saveWorkflow(app, workflowName)

      await openWorkflowInBuilder(app, workflowName)
      await openNodeForEditing(app, 'ToolsSchemaAgent')

      const form = app.getByTestId('ai-agent-node-form')
      await expect(form).toBeVisible({ timeout: 10_000 })

      await expect(form.getByRole('textbox', { name: 'Select tools' })).toHaveValue('All tools selected', {
        timeout: 30_000,
      })

      const codeEditor = app.getByTestId('inline-code-editor')
      await expect(codeEditor).toBeVisible({ timeout: 10_000 })
      await expect(codeEditor).toContainText('summary', { timeout: 30_000 })
    } finally {
      await deleteWorkflow(app, workflowName)

      if (mcpIntegration) await deleteIntegrationViaApi(app, mcpIntegration.id)
      if (llmIntegration) await deleteLlmIntegration(app, llmIntegration.id)
    }
  })

  test('AI Agent node can be edited after creation', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-llm-integ')
    const workflowName = buildUniqueName('e2e-agent-edit')
    let integration: SeededLlmIntegration | undefined
    try {
      integration = await createLlmIntegration(app, integrationName)
      const { name: credName } = await ensureLlmCredential(app)

      await startWorkflowWithTrigger(app)

      const panel = await clickAddConnectedStep(app)
      await panel.getByRole('button', { name: 'Task Agent' }).click()

      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('EditableAgent')
      await app.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Original prompt')
      await selectLlmCredential(app, credName)

      await app.getByRole('button', { name: 'Create' }).click()
      await closeNodeEditorPanel(app)
      await saveWorkflow(app, workflowName)

      await openWorkflowInBuilder(app, workflowName)
      await openNodeForEditing(app, 'EditableAgent')

      await app.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Updated prompt')
      await app.getByRole('button', { name: 'Update' }).click()
      await expect(app.getByRole('button', { name: 'Update' })).not.toBeAttached({ timeout: 15_000 })

      await saveWorkflow(app, workflowName)

      await openWorkflowInBuilder(app, workflowName)
      await openNodeForEditing(app, 'EditableAgent')

      const form = app.getByTestId('ai-agent-node-form')
      await expect(form).toBeVisible({ timeout: 10_000 })
      await expect(form.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue('Updated prompt', {
        timeout: 30_000,
      })
    } finally {
      await deleteWorkflow(app, workflowName)

      if (integration) await deleteLlmIntegration(app, integration.id)
    }
  })

  test('multiple AI Agent nodes in same workflow', async ({ app }) => {
    const integrationName = buildUniqueName('e2e-llm-integ')
    const workflowName = buildUniqueName('e2e-multi-agent')
    let integration: SeededLlmIntegration | undefined
    try {
      integration = await createLlmIntegration(app, integrationName)
      const { name: credName } = await ensureLlmCredential(app)

      await startWorkflowWithTrigger(app)

      const panel1 = await clickAddConnectedStep(app)
      await panel1.getByRole('button', { name: 'Task Agent' }).click()

      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Agent1')
      await app.getByRole('textbox', { name: 'Prompt', exact: true }).fill('First agent prompt')
      await selectLlmCredential(app, credName)

      await app.getByRole('button', { name: 'Create' }).click()
      await closeNodeEditorPanel(app)

      const panel2 = await clickAddConnectedStep(app)
      await panel2.getByRole('button', { name: 'Task Agent' }).click()

      await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Agent2')
      await app.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Second agent prompt')
      await selectLlmCredential(app, credName)

      await app.getByRole('button', { name: 'Create' }).click()
      await closeNodeEditorPanel(app)

      await expect(canvasNode(app, 'Agent1')).toBeVisible()
      await expect(canvasNode(app, 'Agent2')).toBeVisible()

      await saveWorkflow(app, workflowName)
    } finally {
      await deleteWorkflow(app, workflowName)

      if (integration) await deleteLlmIntegration(app, integration.id)
    }
  })
})
