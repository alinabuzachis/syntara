import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import * as workflowStore from '../../../stores/useWorkflowStore'

import { TaskNodeDetails } from './TaskNodeDetails'

const mockUpdateActivity = vi.fn()
const mockCreateAAPJobTemplateActivity = vi.fn()

vi.spyOn(workflowStore, 'useWorkflowStore').mockImplementation((selector: unknown) => {
  const store = {
    updateActivity: mockUpdateActivity,
  }
  return selector ? selector(store) : store
})

vi.spyOn(workflowStore, 'useWorkflowStoreActions').mockImplementation(() => ({
  updateActivity: mockUpdateActivity,
  setWorkflow: vi.fn(),
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
vi.mock('../../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
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

    render(<TaskNodeDetails taskData={taskData} nodeId="task-aap" onClose={mockOnClose} />)

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
