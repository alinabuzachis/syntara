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
  syncConvergeNodeBranches: vi.fn(),
  moveActivityBefore: vi.fn(),
  moveActivityAfter: vi.fn(),
  reorderActivitiesFromEdges: vi.fn(),
  batchRemoveNodesAndEdges: vi.fn(),
  batchAddActivitiesAndEdges: vi.fn(),
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
        {submitButtonText ?? 'Add node'}
      </button>
      <button
        onClick={() =>
          onSubmit({
            name: 'Updated API Task',
            executor: 'api',
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
            executor: 'api',
            method: 'POST',
            url: 'https://api.test.com',
            body: 'plain text body',
          })
        }
        data-testid="submit-api-plain-body-button"
      >
        Submit API Plain Body
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
            jobTemplateId: '456',
            inventory: '789',
            credentials: '10,20',
            extraVars: '{"key": "value"}',
            limit: 'servers',
            tags: 'install',
            skipTags: 'debug',
            verbosity: '3',
          })
        }
        data-testid="aap-submit-button"
      >
        {submitButtonText ?? 'Add node'}
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
      <TaskNodeDetails
        taskData={taskData as TaskActivity & { task: { executor: string; config: unknown } }}
        nodeId={nodeId}
        onClose={mockOnClose}
        onHeaderContentChange={vi.fn()}
      />
    )

  beforeEach(() => {
    vi.clearAllMocks()
    // Setup mockCreateAAPJobTemplateActivity to return proper activity structure
    mockCreateAAPJobTemplateActivity.mockImplementation((id, name, jobTemplateId, config) => ({
      type: 'task' as const,
      id,
      name,
      task: {
        executor: 'aap_job_template' as const,
        config: {
          jobTemplateId,
          ...config,
        },
      },
    }))
  })

  it('renders ActionNodeForm for script task', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-1',
      name: 'Script Task',
      task: {
        executor: 'script' as const,
        config: {
          language: 'python' as const,
          code: 'print("hello")',
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-1')

    expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
  })

  it('renders ActionNodeForm for API task', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-2',
      name: 'API Task',
      task: {
        executor: 'api' as const,
        config: {
          method: 'GET' as const,
          url: 'https://api.example.com',
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-2')

    expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
  })

  it('renders AAPNodeForm for aap_job_template task', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-aap',
      name: 'AAP Task',
      task: {
        executor: 'aap_job_template' as const,
        config: {
          jobTemplateId: 123,
          inventory: 456,
          extraVars: { foo: 'bar' },
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-aap')

    expect(screen.getByTestId('aap-node-form')).toBeInTheDocument()
  })

  it('renders AAPNodeForm with minimal config (only jobTemplateId)', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-aap-minimal',
      name: 'Minimal AAP Task',
      task: {
        executor: 'aap_job_template' as const,
        config: {
          jobTemplateId: 789,
          // No inventory, credentials, extraVars, etc.
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-aap-minimal')

    expect(screen.getByTestId('aap-node-form')).toBeInTheDocument()
  })

  it('renders AIAgentNodeDetails for agentic task', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-agent',
      name: 'AI Agent Task',
      task: {
        executor: 'agentic' as const,
        config: {
          agent: '',
          model: 'claude-3-sonnet',
          prompt: 'Analyze the data',
          tools: ['calculator', 'web_search'],
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-agent')

    expect(screen.getByTestId('ai-agent-node-details')).toBeInTheDocument()
    expect(screen.getByTestId('agent-node-id')).toHaveTextContent('task-agent')
    expect(screen.getByTestId('agent-task-name')).toHaveTextContent('AI Agent Task')
  })

  it('returns null for unsupported executor type', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-3',
      name: 'Unsupported Task',
      task: {
        executor: 'unsupported' as never,
        config: {} as never,
      },
    }

    const { container } = renderTaskNodeDetails(taskData, 'task-3')

    expect(container.firstChild).toBeNull()
  })

  it('calls updateActivity on successful form submission', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'task' as const,
      id: 'task-1',
      name: 'Original Task',
      task: {
        executor: 'script' as const,
        config: {
          language: 'python' as const,
          code: 'print("original")',
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-1')

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith('task-1', expect.objectContaining({ name: 'Updated Task' }))
  })

  it('calls updateActivity on successful AAP form submission', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'task' as const,
      id: 'task-aap',
      name: 'AAP Task',
      task: {
        executor: 'aap_job_template' as const,
        config: {
          jobTemplateId: 123,
          inventory: 456,
          credentials: [1, 2, 3],
          extraVars: { env: 'prod' },
          limit: 'webservers',
          tags: 'deploy',
          skipTags: 'testing',
          verbosity: 2,
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-aap')

    await user.click(screen.getByTestId('aap-submit-button'))

    // AAP nodes use aap_job_template executor
    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'task-aap',
      expect.objectContaining({
        name: 'Updated AAP Task',
        task: expect.objectContaining({
          executor: 'aap_job_template',
          config: expect.objectContaining({
            jobTemplateId: 456,
            inventory: 789,
            credentials: [10, 20],
            extraVars: { key: 'value' },
            limit: 'servers',
            tags: 'install',
            skipTags: 'debug',
            verbosity: 3,
          }),
        }),
      })
    )
  })

  it('displays "Update node" as submit button text', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-1',
      name: 'Task',
      task: {
        executor: 'script' as const,
        config: {
          language: 'python' as const,
          code: 'print("test")',
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-1')

    expect(screen.getByText('Update node')).toBeInTheDocument()
  })

  it('returns null for approval node (type approval)', () => {
    const taskData = {
      type: 'approval' as const,
      id: 'task-approval',
      name: 'Approval Task',
      onApproved: [],
      onRejected: [],
      approval: {
        approvers: ['admin'],
        prompt: 'Please approve',
      },
    } as unknown as TaskActivity

    const { container } = renderTaskNodeDetails(taskData, 'task-approval')

    expect(container.firstChild).toBeNull()
  })

  it('handles API form submission with headers and body', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'task' as const,
      id: 'task-api',
      name: 'API Task',
      task: {
        executor: 'api' as const,
        config: {
          method: 'GET' as const,
          url: 'https://api.example.com',
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-api')

    await user.click(screen.getByTestId('submit-api-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'task-api',
      expect.objectContaining({
        name: 'Updated API Task',
        task: expect.objectContaining({
          executor: 'api',
          config: expect.objectContaining({
            method: 'POST',
            url: 'https://api.test.com',
            headers: { 'Content-Type': 'application/json' },
            body: { data: 'test' },
          }),
        }),
      })
    )
  })

  it('handles API form submission with plain text body', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'task' as const,
      id: 'task-api',
      name: 'API Task',
      task: {
        executor: 'api' as const,
        config: {
          method: 'GET' as const,
          url: 'https://api.example.com',
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-api')

    await user.click(screen.getByTestId('submit-api-plain-body-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'task-api',
      expect.objectContaining({
        task: expect.objectContaining({
          config: expect.objectContaining({
            body: 'plain text body',
          }),
        }),
      })
    )
  })

  it('renders API task with inputs/parameters', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-api-params',
      name: 'API Task with Params',
      task: {
        executor: 'api' as const,
        config: {
          method: 'POST' as const,
          url: 'https://api.example.com',
        },
        inputs: {
          userId: '{{user.id}}',
          timestamp: '{{now}}',
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-api-params')

    expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
  })

  it('renders API task with string body in config', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-api-string-body',
      name: 'API Task with String Body',
      task: {
        executor: 'api' as const,
        config: {
          method: 'POST' as const,
          url: 'https://api.example.com',
          body: 'raw string body',
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-api-string-body')

    expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
  })

  it('shows error when updateActivity throws', async () => {
    const user = userEvent.setup()
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('Update failed')
    })
    const taskData = {
      type: 'task' as const,
      id: 'task-1',
      name: 'Task',
      task: {
        executor: 'script' as const,
        config: {
          language: 'python' as const,
          code: 'print("test")',
        },
      },
    }

    renderTaskNodeDetails(taskData, 'task-1')

    await user.click(screen.getByTestId('submit-button'))

    expect(mockShowError).toHaveBeenCalledWith('Update failed', 'Update Failed')
  })
})
