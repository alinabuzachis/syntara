import type { TaskActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as workflowStore from '../../../stores/useWorkflowStore'
import type { WorkflowStore } from '../../../stores/useWorkflowStore'

import { TaskNodeDetails } from './TaskNodeDetails'

const mockUpdateActivity = vi.fn()
const mockCreateAAPJobTemplateActivity = vi.fn()

vi.spyOn(workflowStore, 'useWorkflowStore').mockImplementation((selector?: (state: WorkflowStore) => unknown) => {
  const store = {
    updateActivity: mockUpdateActivity,
  }
  return selector ? selector(store as unknown as WorkflowStore) : store
})

vi.spyOn(workflowStore, 'useWorkflowStoreActions').mockImplementation(() => ({
  updateActivity: mockUpdateActivity,
  setWorkflow: vi.fn(),
  loadWorkflowWithEdges: vi.fn(),
  updateWorkflow: vi.fn(),
  markClean: vi.fn(),
  markDirty: vi.fn(),
  setEdges: vi.fn(),
  addTrigger: vi.fn(),
  removeTrigger: vi.fn(),
  updateTrigger: vi.fn(),
  addActivity: vi.fn(),
  removeActivity: vi.fn(),
  replaceActivity: vi.fn(),
  duplicateActivity: vi.fn(),
  syncConvergeNodeBranches: vi.fn(),
  moveActivityBefore: vi.fn(),
  moveActivityAfter: vi.fn(),
  reorderActivitiesFromEdges: vi.fn(),
  batchRemoveNodesAndEdges: vi.fn(),
  batchAddActivitiesAndEdges: vi.fn(),
  updateNodePositions: vi.fn(),
}))

vi.spyOn(workflowStore, 'createAAPJobTemplateActivity').mockImplementation(mockCreateAAPJobTemplateActivity)

// Mock the alerts hook
const mockShowError = vi.fn()
vi.mock('../../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: mockShowError,
  })),
}))

// Mock ActionNodeForm
vi.mock('../node-forms/ActionNodeForm', () => ({
  ActionNodeForm: ({
    onSubmit,
    onCancel,
    submitButtonText,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    onCancel: () => void
    submitButtonText?: string
  }) => (
    <div data-testid="action-node-form">
      <button onClick={() => onSubmit({ name: 'Updated Task', executor: 'script' })} data-testid="submit-button">
        {submitButtonText ?? 'Add step'}
      </button>
      <button
        onClick={() =>
          onSubmit({
            name: 'Updated API Task',
            executor: 'http_request',
            method: 'POST',
            url: 'https://api.test.com',
            headers: '{"Content-Type": "application/json"}',
            body: '{"data": "test"}',
          })
        }
        data-testid="submit-api-button"
      >
        Submit API
      </button>
      <button
        onClick={() =>
          onSubmit({
            name: 'API with Invalid Body',
            executor: 'http_request',
            method: 'POST',
            url: 'https://api.test.com',
            body: 'plain text body',
          })
        }
        data-testid="submit-api-plain-body-button"
      >
        Submit API Plain Body
      </button>
      <button
        onClick={() =>
          onSubmit({
            name: 'API with Invalid Headers',
            executor: 'http_request',
            method: 'POST',
            url: 'https://api.test.com',
            headers: '{ invalid json',
          })
        }
        data-testid="submit-api-invalid-headers-button"
      >
        Submit API Invalid Headers
      </button>
      <button
        onClick={() =>
          onSubmit({
            name: 'API with Credential',
            executor: 'http_request',
            method: 'GET',
            url: 'https://api.test.com',
            credential_id: 'cred-123',
          })
        }
        data-testid="submit-api-credential-button"
      >
        Submit API with Credential
      </button>
      <button onClick={onCancel} data-testid="cancel-button">
        Cancel
      </button>
    </div>
  ),
}))

// Mock AAPNodeForm
vi.mock('../node-forms/AAPNodeForm', () => ({
  AAPNodeForm: ({
    onSubmit,
    onCancel,
    submitButtonText,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    onCancel: () => void
    submitButtonText?: string
    onHeaderContentChange: (content: ReactNode | null) => void
  }) => (
    <div data-testid="aap-node-form">
      <button
        onClick={() =>
          onSubmit({
            name: 'Updated AAP Task',
            job_template_id: 456,
            inventory_name: '789',
            extra_vars: '{"key": "value"}',
            limit: 'servers',
            tags: 'install',
            skip_tags: 'debug',
            verbosity: '3',
          })
        }
        data-testid="aap-submit-button"
      >
        {submitButtonText ?? 'Add step'}
      </button>
      <button onClick={onCancel} data-testid="aap-cancel-button">
        Cancel
      </button>
    </div>
  ),
}))

// Mock AIAgentNodeDetails
vi.mock('./AIAgentNodeDetails', () => ({
  AIAgentNodeDetails: ({
    taskData,
    nodeId,
    onClose,
  }: {
    taskData: Record<string, unknown>
    nodeId: string
    onClose: () => void
  }) => (
    <div data-testid="ai-agent-node-details">
      <div data-testid="agent-node-id">{nodeId}</div>
      <div data-testid="agent-task-name">{String(taskData.name)}</div>
      <button onClick={onClose} data-testid="agent-close-button">
        Close
      </button>
    </div>
  ),
}))

describe('TaskNodeDetails Component', () => {
  const mockOnClose = vi.fn()
  const renderTaskNodeDetails = (taskData: TaskActivity, nodeId: string) =>
    render(
      <TaskNodeDetails taskData={taskData} nodeId={nodeId} onClose={mockOnClose} onHeaderContentChange={vi.fn()} />
    )

  beforeEach(() => {
    vi.clearAllMocks()
    // Setup mockCreateAAPJobTemplateActivity to return proper activity structure
    mockCreateAAPJobTemplateActivity.mockImplementation(
      (id: string, name: string, job_template_id: number, config?: Record<string, unknown>) => ({
        type: 'aap_job_template' as const,
        id,
        name,
        config: {
          job_template_id,
          ...config,
        },
      })
    )
  })

  it('renders ActionNodeForm for script task', () => {
    const taskData = {
      type: 'script' as const,
      id: 'task-1',
      name: 'Script Task',
      config: {
        language: 'python' as const,
        code: 'print("hello")',
      },
    }

    renderTaskNodeDetails(taskData, 'task-1')

    expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
  })

  it('renders ActionNodeForm for API task', () => {
    const taskData = {
      type: 'http_request' as const,
      id: 'task-2',
      name: 'API Task',
      config: {
        method: 'GET' as const,
        url: 'https://api.example.com',
      },
    }

    renderTaskNodeDetails(taskData, 'task-2')

    expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
  })

  it('renders AAPNodeForm for aap_job_template task', () => {
    const taskData = {
      type: 'aap_job_template' as const,
      id: 'task-aap',
      name: 'AAP Task',
      config: {
        job_template_id: 123,
        inventory_id: 456,
        extra_vars: { foo: 'bar' },
      },
    }

    renderTaskNodeDetails(taskData, 'task-aap')

    expect(screen.getByTestId('aap-node-form')).toBeInTheDocument()
  })

  it('renders AAPNodeForm with minimal config (only job_template_id)', () => {
    const taskData = {
      type: 'aap_job_template' as const,
      id: 'task-aap-minimal',
      name: 'Minimal AAP Task',
      config: {
        job_template_id: 789,
      },
    }

    renderTaskNodeDetails(taskData, 'task-aap-minimal')

    expect(screen.getByTestId('aap-node-form')).toBeInTheDocument()
  })

  it('renders AAPNodeForm for expression mode config (job_template_name without job_template_id)', () => {
    const taskData = {
      type: 'aap_job_template' as const,
      id: 'task-aap-expr',
      name: 'Expression AAP Task',
      config: {
        job_template_name: '${trigger.template}',
        organization_name: '${trigger.org}',
        credential_id: 'cred-abc',
      },
    }

    renderTaskNodeDetails(taskData, 'task-aap-expr')

    expect(screen.getByTestId('aap-node-form')).toBeInTheDocument()
  })

  it('renders AIAgentNodeDetails for agentic task', () => {
    const taskData = {
      type: 'agentic' as const,
      id: 'task-agent',
      name: 'AI Agent Task',
      config: {
        model: 'claude-3-sonnet',
        prompt: 'Analyze the data',
        tool_selections: ['calculator', 'web_search'],
      },
    }

    renderTaskNodeDetails(taskData, 'task-agent')

    expect(screen.getByTestId('ai-agent-node-details')).toBeInTheDocument()
    expect(screen.getByTestId('agent-node-id')).toHaveTextContent('task-agent')
    expect(screen.getByTestId('agent-task-name')).toHaveTextContent('AI Agent Task')
  })

  it('returns null for unsupported executor type', () => {
    const taskData = {
      type: 'unsupported' as never,
      id: 'task-3',
      name: 'Unsupported Task',
      config: {},
    }

    const { container } = renderTaskNodeDetails(taskData, 'task-3')

    expect(container).toBeEmptyDOMElement()
  })

  it('calls updateActivity on successful form submission', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'script' as const,
      id: 'task-1',
      name: 'Original Task',
      config: {
        language: 'python' as const,
        code: 'print("original")',
      },
    }

    renderTaskNodeDetails(taskData, 'task-1')

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith('task-1', expect.objectContaining({ name: 'Updated Task' }))
  })

  it('calls updateActivity on successful AAP form submission', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'aap_job_template' as const,
      id: 'task-aap',
      name: 'AAP Task',
      config: {
        job_template_id: 123,
        inventory_id: 456,
        job_credentials: [1, 2, 3],
        extra_vars: { env: 'prod' },
        limit: 'webservers',
        tags: 'deploy',
        skip_tags: 'testing',
        verbosity: 2,
      },
    }

    renderTaskNodeDetails(taskData, 'task-aap')

    await user.click(screen.getByTestId('aap-submit-button'))

    // AAP nodes use aap_job_template type directly in v2
    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'task-aap',
      expect.objectContaining({
        name: 'Updated AAP Task',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          job_template_id: 456,
        }),
      })
    )
  })

  it('displays "Update step" as submit button text', () => {
    const taskData = {
      type: 'script' as const,
      id: 'task-1',
      name: 'Task',
      config: {
        language: 'python' as const,
        code: 'print("test")',
      },
    }

    renderTaskNodeDetails(taskData, 'task-1')

    expect(screen.getByText('Update step')).toBeInTheDocument()
  })

  it('returns null for approval node (type approval)', () => {
    const taskData = {
      type: 'approval' as const,
      id: 'task-approval',
      name: 'Approval Task',
      config: {
        approver_timeout: 3600,
      },
    } as unknown as TaskActivity

    const { container } = renderTaskNodeDetails(taskData, 'task-approval')

    expect(container).toBeEmptyDOMElement()
  })

  it('handles API form submission with headers and body', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'http_request' as const,
      id: 'task-api',
      name: 'API Task',
      config: {
        method: 'GET' as const,
        url: 'https://api.example.com',
      },
    }

    renderTaskNodeDetails(taskData, 'task-api')

    await user.click(screen.getByTestId('submit-api-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'task-api',
      expect.objectContaining({
        name: 'Updated API Task',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          method: 'POST',
          url: 'https://api.test.com',
          headers: { 'Content-Type': 'application/json' },
          body: { data: 'test' },
        }),
      })
    )
  })

  it('stores credential_id in snake_case in workflow config (AAP-73929)', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'http_request' as const,
      id: 'task-api-cred',
      name: 'API Task',
      config: {
        method: 'GET' as const,
        url: 'https://api.example.com',
      },
    }

    renderTaskNodeDetails(taskData, 'task-api-cred')

    await user.click(screen.getByTestId('submit-api-credential-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'task-api-cred',
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          credential_id: 'cred-123',
        }),
      })
    )
    // Must NOT use camelCase — backend looks for credential_id
    const callArgs = mockUpdateActivity.mock.calls[0] as [string, { config: Record<string, unknown> }]
    expect(callArgs[1].config).not.toHaveProperty('credentialId')
  })

  it('handles API form submission with plain text body', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'http_request' as const,
      id: 'task-api',
      name: 'API Task',
      config: {
        method: 'GET' as const,
        url: 'https://api.example.com',
      },
    }

    renderTaskNodeDetails(taskData, 'task-api')

    await user.click(screen.getByTestId('submit-api-plain-body-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'task-api',
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          body: 'plain text body',
        }),
      })
    )
  })

  it('renders API task with inputs/parameters', () => {
    const taskData = {
      type: 'http_request' as const,
      id: 'task-api-params',
      name: 'API Task with Params',
      config: {
        method: 'POST' as const,
        url: 'https://api.example.com',
      },
      inputs: {
        userId: '{{user.id}}',
        timestamp: '{{now}}',
      },
    }

    renderTaskNodeDetails(taskData, 'task-api-params')

    expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
  })

  it('renders API task with string body in config', () => {
    const taskData = {
      type: 'http_request' as const,
      id: 'task-api-string-body',
      name: 'API Task with String Body',
      config: {
        method: 'POST' as const,
        url: 'https://api.example.com',
        body: 'raw string body',
      },
    }

    renderTaskNodeDetails(taskData, 'task-api-string-body')

    expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
  })

  it('shows error when updateActivity throws', async () => {
    const user = userEvent.setup()
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('The update failed')
    })
    const taskData = {
      type: 'script' as const,
      id: 'task-1',
      name: 'Task',
      config: {
        language: 'python' as const,
        code: 'print("test")',
      },
    }

    renderTaskNodeDetails(taskData, 'task-1')

    await user.click(screen.getByTestId('submit-button'))

    expect(mockShowError).toHaveBeenCalledWith({ title: 'Update failed', description: 'The update failed' })
  })

  it('shows error when updateActivity throws during API form submission', async () => {
    const user = userEvent.setup()
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('The update failed')
    })
    const taskData = {
      type: 'http_request' as const,
      id: 'task-api',
      name: 'API Task',
      config: {
        url: 'https://api.test.com',
        method: 'GET' as const,
      },
    }

    renderTaskNodeDetails(taskData, 'task-api')

    await user.click(screen.getByTestId('submit-api-button'))

    expect(mockShowError).toHaveBeenCalledWith({ title: 'Update failed', description: 'The update failed' })
  })

  it('shows error when submitting API form with invalid headers JSON', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'http_request' as const,
      id: 'task-api',
      name: 'API Task',
      config: {
        method: 'GET' as const,
        url: 'https://api.example.com',
      },
    }

    renderTaskNodeDetails(taskData, 'task-api')

    await user.click(screen.getByTestId('submit-api-invalid-headers-button'))

    // Invalid headers JSON should show an error and prevent save
    expect(mockShowError).toHaveBeenCalledWith({
      title: 'Invalid headers format',
      description:
        'Headers must be valid JSON. Please fix the format before saving. Example: {"Content-Type":"application/json"}',
    })

    // updateActivity should NOT be called when headers are invalid
    expect(mockUpdateActivity).not.toHaveBeenCalled()
  })
})
