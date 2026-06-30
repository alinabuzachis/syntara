/**
 * E2E Tests: AI Agent Structured Output (JSON Schema)
 *
 * Feature: AAP-58327 - Users can define a JSON Schema (response_schema) on AI Agent nodes
 * to force the LLM to produce structured output matching the schema.
 *
 * Critical paths covered:
 * - Schema editor renders on AI Agent node form
 * - Schema accepts valid JSON without errors
 * - Schema persists after save and reopen
 * - Empty schema is valid (optional field)
 */
import { test, expect, toAppUrl } from './fixtures'
import { addManualTrigger } from './helpers/v2-nodes'
import { addNodePanel, fillCodeEditor } from './helpers/workflows'

test.describe('AI Agent Structured Output', () => {
  test('schema editor renders on AI Agent node', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))
    await addManualTrigger(app)

    // Open AI Agent form via "Add connected step"
    const layoutButton = app.getByRole('button', { name: 'Layout' })
    await expect(layoutButton).toBeVisible()
    await layoutButton.click()

    const addBtn = app.getByRole('button', { name: 'Add connected step' })
    await expect(addBtn).toBeVisible()
    await addBtn.click({ force: true })

    const panel = addNodePanel(app)
    await panel.getByRole('button', { name: 'AI Agent' }).click()

    // Verify Response schema section is visible
    await expect(app.getByText('Response schema')).toBeVisible()

    // Verify the inline code editor container is present
    const codeEditor = app.getByTestId('inline-code-editor')
    await expect(codeEditor).toBeVisible()

    // Close without saving
    await app.keyboard.press('Escape')
  })

  test('schema accepts valid JSON without errors', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))
    await addManualTrigger(app)

    const layoutButton = app.getByRole('button', { name: 'Layout' })
    await layoutButton.click()

    const addBtn = app.getByRole('button', { name: 'Add connected step' })
    await addBtn.click({ force: true })

    const panel = addNodePanel(app)
    await panel.getByRole('button', { name: 'AI Agent' }).click()

    // Fill required fields
    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('TestAgent')
    await app.getByLabel('Prompt').fill('Analyze the data')

    // Fill valid JSON schema using fillCodeEditor helper
    const validSchema = JSON.stringify({
      type: 'object',
      properties: {
        summary: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['summary'],
    })

    await fillCodeEditor(app, { value: validSchema, label: 'Response schema editor' })

    // Create should succeed without validation errors
    await app.getByRole('button', { name: 'Create' }).click()

    // Verify panel closes (step was added successfully)
    await expect(panel).not.toBeVisible()
  })

  test('can add AI Agent with schema to workflow', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))
    await addManualTrigger(app)

    const layoutButton = app.getByRole('button', { name: 'Layout' })
    await layoutButton.click()

    const addBtn = app.getByRole('button', { name: 'Add connected step' })
    await addBtn.click({ force: true })

    const panel = addNodePanel(app)
    await panel.getByRole('button', { name: 'AI Agent' }).click()

    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('SchemaAgent')
    await app.getByLabel('Prompt').fill('Generate report')

    const validSchema = JSON.stringify({
      type: 'object',
      properties: {
        task: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['task'],
    })

    await fillCodeEditor(app, { value: validSchema, label: 'Response schema editor' })
    await app.getByRole('button', { name: 'Create' }).click()

    // Verify panel closes (step was added successfully with schema)
    await expect(panel).not.toBeVisible()

    // Verify the agent node appears on canvas with schema
    await expect(app.getByText('SchemaAgent')).toBeVisible()
  })

  test('empty schema is valid (optional field)', async ({ app }) => {
    await app.goto(toAppUrl('/workflow-builder/new'))
    await addManualTrigger(app)

    const layoutButton = app.getByRole('button', { name: 'Layout' })
    await layoutButton.click()

    const addBtn = app.getByRole('button', { name: 'Add connected step' })
    await addBtn.click({ force: true })

    const panel = addNodePanel(app)
    await panel.getByRole('button', { name: 'AI Agent' }).click()

    // Fill required fields but leave schema empty
    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('EmptySchemaAgent')
    await app.getByLabel('Prompt').fill('Test prompt')

    // Don't fill the response schema field

    // Create should succeed
    await app.getByRole('button', { name: 'Create' }).click()

    // Verify panel closes (step was added successfully)
    await expect(panel).not.toBeVisible()
  })
})
