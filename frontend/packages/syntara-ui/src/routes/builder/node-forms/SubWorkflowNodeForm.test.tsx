import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SubWorkflowNodeForm } from './SubWorkflowNodeForm'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../../../client', () => ({ workflowFetchClient: { GET: mocks.get } }))
vi.mock('../../workflows/useWorkflowsQuery', () => ({
  useWorkflowsQuery: vi.fn(() => ({
    workflowsQuery: { isLoading: false, isError: false },
    workflows: [
      {
        id: 'workflow-1',
        name: 'Child workflow',
        current_version: 9,
        published_version_number: 3,
        is_enabled: true,
        project_id: 'project-1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
  })),
}))
vi.mock('../hooks/useWorkflowEngineDefaults', () => ({
  useWorkflowEngineDefaults: vi.fn(() => ({ defaults: { continueOnFailure: true } })),
}))

function buildInvocationSchema(overrides: Record<string, unknown> = {}) {
  return {
    workflow_id: 'workflow-1',
    published_version_id: 'version-3',
    published_version: 3,
    is_eligible: true,
    triggers: [
      {
        trigger_node_id: 'sub-trigger-1',
        name: 'Subworkflow Trigger',
        input_schema: {
          type: 'object',
          required: ['host'],
          properties: {
            host: { type: 'string', description: 'Target host' },
            port: { type: 'integer', default: 22 },
          },
        },
      },
    ],
    ...overrides,
  }
}

function renderForm(props: Partial<React.ComponentProps<typeof SubWorkflowNodeForm>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <FormWithHeader {...props} />
    </QueryClientProvider>
  )
}

function submitWorkflowForm() {
  screen.getByTestId<HTMLFormElement>('sub-workflow-node-form').requestSubmit()
}

function FormWithHeader(props: Partial<React.ComponentProps<typeof SubWorkflowNodeForm>>) {
  const [headerContent, setHeaderContent] = useState<ReactNode | null>(null)
  return (
    <>
      <div data-testid="subworkflow-form-header">{headerContent}</div>
      <SubWorkflowNodeForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        projectId="project-1"
        onHeaderContentChange={setHeaderContent}
        {...props}
      />
    </>
  )
}

async function selectChildWorkflow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByPlaceholderText('Search for a published workflow...'))
  await user.click(await screen.findByText('Child workflow (v3)'))
}

describe('SubWorkflowNodeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue({ data: buildInvocationSchema(), response: new Response() })
  })

  it('renders the workflow selector and loads schema fields after a child is selected', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Input Mapping JSON' })).not.toBeInTheDocument()
    await selectChildWorkflow(user)

    expect(screen.getByText('Inputs for Subworkflow Trigger')).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'host' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'port' })).toHaveValue('22')
    const triggerField = screen.getByRole('textbox', { name: 'Workflow trigger' })
    expect(triggerField).toHaveValue('Subworkflow Trigger')
    expect(triggerField).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: 'More info for Workflow trigger' }))
    expect(
      await screen.findByText(
        'The selected Sub-workflow Trigger determines which entry point is invoked when this sub-workflow runs. A workflow with one trigger selects it automatically; choose a trigger here when the workflow has multiple entry points.'
      )
    ).toBeInTheDocument()
  })

  it('shows the backend timeout fallback in the settings tab', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('tab', { name: 'Settings' }))

    expect(screen.getByRole('spinbutton', { name: 'Timeout (seconds)' })).toHaveAttribute(
      'placeholder',
      'System default'
    )
  })

  it('submits the selected workflow, trigger, and typed mapping values', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    await user.type(screen.getByLabelText('Name'), 'Call child')
    await selectChildWorkflow(user)
    await user.click(screen.getByRole('textbox', { name: 'host' }))
    await user.paste('${lookup.hostname}')
    await user.clear(screen.getByRole('textbox', { name: 'port' }))
    await user.type(screen.getByRole('textbox', { name: 'port' }), '8443')
    submitWorkflowForm()

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Call child',
          workflow_id: 'workflow-1',
          trigger_node_id: 'sub-trigger-1',
          input_mapping: { host: '${lookup.hostname}', port: 8443 },
        })
      )
    })
  })

  it('fills the sole trigger when editing an older reference without a saved trigger ID', async () => {
    const onSubmit = vi.fn()
    mocks.get.mockResolvedValue({
      data: buildInvocationSchema({
        triggers: [{ trigger_node_id: 'sub-trigger-1', name: 'Subworkflow Trigger' }],
      }),
      response: new Response(),
    })
    renderForm({ onSubmit, initialData: { name: 'Legacy child step', workflow_id: 'workflow-1' } })

    await waitFor(() => expect(screen.queryByLabelText('Loading child workflow inputs')).not.toBeInTheDocument())
    submitWorkflowForm()

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ workflow_id: 'workflow-1', trigger_node_id: 'sub-trigger-1' })
      )
    })
  })

  it('requires a workflow and trigger before submitting', async () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    submitWorkflowForm()

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled())
    expect(await screen.findByText('Select a child workflow')).toBeInTheDocument()
  })

  it('allows selecting one trigger when the child has multiple', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    mocks.get.mockResolvedValue({
      data: buildInvocationSchema({
        triggers: [
          {
            trigger_node_id: 'trigger-1',
            name: 'One',
            input_schema: { type: 'object', properties: { a: { type: 'string' } } },
          },
          {
            trigger_node_id: 'trigger-2',
            name: 'Two',
            input_schema: { type: 'object', properties: { b: { type: 'string' } } },
          },
        ],
      }),
      response: new Response(),
    })
    renderForm({ onSubmit })

    await user.type(screen.getByLabelText('Name'), 'Multiple triggers')
    await selectChildWorkflow(user)
    await user.click(screen.getByRole('button', { name: 'More info for Workflow trigger' }))
    expect(
      await screen.findByText(
        'The selected Sub-workflow Trigger determines which entry point is invoked when this sub-workflow runs. A workflow with one trigger selects it automatically; choose a trigger here when the workflow has multiple entry points.'
      )
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Workflow trigger' }))
    await user.click(screen.getByText('Two'))
    await user.type(await screen.findByRole('textbox', { name: 'b' }), 'value')
    submitWorkflowForm()

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ trigger_node_id: 'trigger-2', input_mapping: { b: 'value' } })
      )
    })
  })

  it('requires choosing a trigger when the child has multiple', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    mocks.get.mockResolvedValue({
      data: buildInvocationSchema({
        triggers: [
          { trigger_node_id: 'trigger-1', name: 'One', input_schema: { type: 'object', properties: {} } },
          { trigger_node_id: 'trigger-2', name: 'Two', input_schema: { type: 'object', properties: {} } },
        ],
      }),
      response: new Response(),
    })
    renderForm({ onSubmit })

    await user.type(screen.getByLabelText('Name'), 'Choose a trigger')
    await selectChildWorkflow(user)
    await screen.findByRole('button', { name: 'Workflow trigger' })
    submitWorkflowForm()

    expect(await screen.findByText('Select a workflow with an available Subworkflow Trigger.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('uses free-form JSON when the selected trigger has no input schema', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    mocks.get.mockResolvedValue({
      data: buildInvocationSchema({
        triggers: [{ trigger_node_id: 'sub-trigger-1', name: 'Subworkflow Trigger' }],
      }),
      response: new Response(),
    })
    renderForm({ onSubmit })

    await user.type(screen.getByLabelText('Name'), 'JSON mapping')
    await selectChildWorkflow(user)
    expect(screen.getByText('Inputs for Subworkflow Trigger (JSON)')).toBeInTheDocument()
    const mappingInput = await screen.findByRole('textbox', { name: 'Input Mapping JSON' })
    await user.clear(mappingInput)
    await user.click(mappingInput)
    await user.paste('{"payload":{"count":3}}')
    submitWorkflowForm()

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ input_mapping: { payload: { count: 3 } } }))
    })
  })

  it('shows a read-permission warning for an existing child the user cannot read', async () => {
    mocks.get.mockResolvedValue({
      error: { detail: 'Forbidden' },
      response: new Response(null, { status: 403 }),
    })
    renderForm({ initialData: { workflow_id: 'workflow-1', trigger_node_id: 'sub-trigger-1' } })

    expect(await screen.findByText('You do not have permission to read this child workflow.')).toBeInTheDocument()
  })

  it('shows a warning when the selected workflow is no longer eligible', async () => {
    mocks.get.mockResolvedValue({
      data: buildInvocationSchema({ is_eligible: false, triggers: [] }),
      response: new Response(),
    })
    renderForm({ initialData: { workflow_id: 'workflow-1' } })

    expect(await screen.findByText('This workflow has no eligible Subworkflow Trigger.')).toBeInTheDocument()
  })

  it('has no accessibility violations after selecting an eligible child', async () => {
    const user = userEvent.setup()
    const { container } = renderForm()
    await selectChildWorkflow(user)

    await screen.findByRole('textbox', { name: 'host' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
