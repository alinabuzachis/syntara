import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import * as workflowStore from '../../../stores/useWorkflowStore'

import { TaskNodeDetails } from './TaskNodeDetails'

const mockUpdateActivity = vi.fn()
const mockCreateConnectorActivity = vi.fn()

vi.spyOn(workflowStore, 'useWorkflowStore').mockImplementation((selector: unknown) => {
  const store = {
    updateActivity: mockUpdateActivity,
  }
  return selector ? selector(store) : store
})

vi.spyOn(workflowStore, 'createConnectorActivity').mockImplementation(mockCreateConnectorActivity)

// Mock the alerts hook
vi.mock('@ansible/nexus-ui-framework', async () => {
  const actual = await vi.importActual('@ansible/nexus-ui-framework')
  return {
    ...actual,
    useAlerts: vi.fn(() => ({
      showSuccess: vi.fn(),
      showError: vi.fn(),
    })),
  }
})

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
      <button onClick={() => onSubmit({ name: 'Updated Task' })} data-testid="submit-button">
        {submitButtonText || 'Add node'}
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
  }) => (
    <div data-testid="aap-node-form">
      <button
        onClick={() =>
          onSubmit({
            name: 'Updated AAP Task',
            connectorId: 'new-connector',
            operation: 'new-op',
            parameters: '{}',
          })
        }
        data-testid="aap-submit-button"
      >
        {submitButtonText || 'Add node'}
      </button>
      <button onClick={onCancel} data-testid="aap-cancel-button">
        Cancel
      </button>
    </div>
  ),
}))

describe('TaskNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Setup mockCreateConnectorActivity to return proper activity structure
    mockCreateConnectorActivity.mockImplementation(
      (id, name, connectorId, operation, parameters, requiresApproval) => ({
        type: 'task' as const,
        id,
        name,
        ...(requiresApproval === true && { requiresApproval: true }),
        metadata: {
          __executorType: 'aap',
          __connectorId: connectorId,
        },
        task: {
          executor: 'agentic' as const,
          config: {
            agent: '__connector_workaround__',
            prompt: JSON.stringify({
              __type: 'connector',
              connectorId,
              operation,
              ...(parameters && { parameters: JSON.parse(parameters) }),
            }),
          },
        },
      })
    )
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

    render(<TaskNodeDetails taskData={taskData} nodeId="task-1" onClose={mockOnClose} />)

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

    render(<TaskNodeDetails taskData={taskData} nodeId="task-2" onClose={mockOnClose} />)

    expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
  })

  it('renders AAPNodeForm for connector task', () => {
    const taskData = {
      type: 'task' as const,
      id: 'task-aap',
      name: 'AAP Task',
      task: {
        executor: 'connector' as const,
        config: {
          connectorId: 'ansible-1',
          operation: 'launch_job',
          parameters: { foo: 'bar' },
        },
      },
    }

    render(<TaskNodeDetails taskData={taskData} nodeId="task-aap" onClose={mockOnClose} />)

    expect(screen.getByTestId('aap-node-form')).toBeInTheDocument()
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

    const { container } = render(<TaskNodeDetails taskData={taskData} nodeId="task-3" onClose={mockOnClose} />)

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

    render(<TaskNodeDetails taskData={taskData} nodeId="task-1" onClose={mockOnClose} />)

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
        executor: 'connector' as const,
        config: {
          connectorId: 'ansible-1',
          operation: 'launch_job',
        },
      },
    }

    render(<TaskNodeDetails taskData={taskData} nodeId="task-aap" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('aap-submit-button'))

    // AAP nodes are now stored as 'agentic' executor (backend workaround)
    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'task-aap',
      expect.objectContaining({
        name: 'Updated AAP Task',
        metadata: expect.objectContaining({
          __executorType: 'aap',
        }),
        task: expect.objectContaining({
          executor: 'agentic',
          config: expect.objectContaining({
            agent: '__connector_workaround__',
            prompt: expect.stringContaining('new-connector'),
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

    render(<TaskNodeDetails taskData={taskData} nodeId="task-1" onClose={mockOnClose} />)

    expect(screen.getByText('Update node')).toBeInTheDocument()
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
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

    render(<TaskNodeDetails taskData={taskData} nodeId="task-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('cancel-button'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })
})
