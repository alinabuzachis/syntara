import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Node } from '@xyflow/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { NodeType } from '../automations/canvas/nodes/NodeType'

import { NodeDetailsPanel } from './NodeDetailsPanel'

// Mock the workflow store
const mockUpdateActivity = vi.fn()
const mockUpdateTrigger = vi.fn()
const mockCurrentWorkflow = {
  name: 'Test Workflow',
  triggers: [{ type: 'manual' }],
  workflow: { activities: [] },
}
vi.mock('../../stores/useWorkflowStore', () => ({
  useWorkflowStore: vi.fn((selector) => {
    const store = {
      updateActivity: mockUpdateActivity,
      currentWorkflow: mockCurrentWorkflow,
    }
    return selector ? selector(store) : store
  }),
  useWorkflowStoreActions: vi.fn(() => ({
    updateActivity: mockUpdateActivity,
    updateTrigger: mockUpdateTrigger,
  })),
  selectCurrentWorkflow: (state: { currentWorkflow: unknown }) => state.currentWorkflow,
  createConnectorActivity: vi.fn(),
  createManualTrigger: vi.fn(() => ({ type: 'manual' })),
  createScheduledTrigger: vi.fn((scheduleType: string, options?: { interval?: string }) => ({
    type: 'scheduled',
    schedule:
      scheduleType === 'interval'
        ? { scheduleType: 'interval', interval: options?.interval ?? '' }
        : { scheduleType: 'continuous' },
  })),
}))

// Mock the alerts hook
vi.mock('../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  })),
}))

// Mock the form components
vi.mock('./node-forms/ActionNodeForm', () => ({
  ActionNodeForm: ({
    onSubmit,
    onCancel,
    submitButtonText,
    initialData,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    onCancel: () => void
    submitButtonText?: string
    initialData?: Record<string, unknown>
  }) => (
    <div data-testid="action-node-form">
      <div data-testid="initial-name">{initialData?.name}</div>
      <div data-testid="submit-button-text">{submitButtonText}</div>
      <button onClick={() => onSubmit({ name: 'Updated Task' })} data-testid="form-submit">
        {submitButtonText || 'Add node'}
      </button>
      <button onClick={onCancel} data-testid="form-cancel">
        Cancel
      </button>
    </div>
  ),
}))

vi.mock('./node-forms/LogicNodeForm', () => ({
  LogicNodeForm: ({
    onSubmit,
    onCancel,
    submitButtonText,
    initialData,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    onCancel: () => void
    submitButtonText?: string
    initialData?: Record<string, unknown>
  }) => (
    <div data-testid="logic-node-form">
      <div data-testid="initial-name">{initialData?.name}</div>
      <div data-testid="submit-button-text">{submitButtonText}</div>
      <button onClick={() => onSubmit({ name: 'Updated Logic', condition: 'true' })} data-testid="form-submit">
        {submitButtonText || 'Add node'}
      </button>
      <button onClick={onCancel} data-testid="form-cancel">
        Cancel
      </button>
    </div>
  ),
}))

describe('NodeDetailsPanel Component', () => {
  const mockOnClose = vi.fn()
  const mockShowSuccess = vi.fn()
  const mockShowError = vi.fn()

  beforeEach(async () => {
    vi.clearAllMocks()
    const { useAlerts } = await import('../../components/alerts')
    vi.mocked(useAlerts).mockReturnValue({
      showSuccess: mockShowSuccess,
      showError: mockShowError,
    } as never)
  })

  describe('Task Node Rendering', () => {
    it('renders task node details panel with script executor', () => {
      const taskNode: Node<NodeType['data']> = {
        id: 'task-1',
        type: 'task',
        position: { x: 0, y: 0 },
        data: {
          type: 'task',
          id: 'task-1',
          name: 'Test Script Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("hello")',
            },
          },
        },
      }

      render(<NodeDetailsPanel node={taskNode} onClose={mockOnClose} />)

      expect(screen.getByRole('heading', { name: 'Test Script Task' })).toBeInTheDocument()
      expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
    })

    it('renders task node details panel with API executor', () => {
      const taskNode: Node<NodeType['data']> = {
        id: 'task-2',
        type: 'task',
        position: { x: 0, y: 0 },
        data: {
          type: 'task',
          id: 'task-2',
          name: 'Test API Task',
          task: {
            executor: 'api',
            config: {
              method: 'GET',
              url: 'https://api.example.com',
            },
          },
        },
      }

      render(<NodeDetailsPanel node={taskNode} onClose={mockOnClose} />)

      expect(screen.getByRole('heading', { name: 'Test API Task' })).toBeInTheDocument()
      expect(screen.getByTestId('action-node-form')).toBeInTheDocument()
    })

    it('passes initial data to ActionNodeForm for script task', () => {
      const taskNode: Node<NodeType['data']> = {
        id: 'task-1',
        type: 'task',
        position: { x: 0, y: 0 },
        data: {
          type: 'task',
          id: 'task-1',
          name: 'Script Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("test")',
            },
          },
        },
      }

      render(<NodeDetailsPanel node={taskNode} onClose={mockOnClose} />)

      expect(screen.getByTestId('initial-name')).toHaveTextContent('Script Task')
      expect(screen.getByTestId('submit-button-text')).toHaveTextContent('Update node')
    })
  })

  describe('Condition Node Rendering', () => {
    it('renders condition node details panel', () => {
      const conditionNode: Node<NodeType['data']> = {
        id: 'condition-1',
        type: 'condition',
        position: { x: 0, y: 0 },
        data: {
          type: 'condition',
          id: 'condition-1',
          name: 'Test Condition',
          condition: 'input.value > 10',
        },
      }

      render(<NodeDetailsPanel node={conditionNode} onClose={mockOnClose} />)

      expect(screen.getByRole('heading', { name: 'Test Condition' })).toBeInTheDocument()
      expect(screen.getByTestId('logic-node-form')).toBeInTheDocument()
      expect(screen.getByTestId('initial-name')).toHaveTextContent('Test Condition')
    })
  })

  describe('Loop Node Rendering', () => {
    it('renders loop node details panel with forEach type', () => {
      const loopNode: Node<NodeType['data']> = {
        id: 'loop-1',
        type: 'loop',
        position: { x: 0, y: 0 },
        data: {
          type: 'loop',
          id: 'loop-1',
          name: 'Test Loop',
          loop: {
            type: 'forEach',
            items: 'input.items',
            do: [],
          },
        },
      }

      render(<NodeDetailsPanel node={loopNode} onClose={mockOnClose} />)

      expect(screen.getByRole('heading', { name: 'Test Loop' })).toBeInTheDocument()
      expect(screen.getByTestId('logic-node-form')).toBeInTheDocument()
    })

    it('renders loop node details panel with while type', () => {
      const loopNode: Node<NodeType['data']> = {
        id: 'loop-2',
        type: 'loop',
        position: { x: 0, y: 0 },
        data: {
          type: 'loop',
          id: 'loop-2',
          name: 'While Loop',
          loop: {
            type: 'while',
            condition: 'counter < 10',
            do: [],
          },
        },
      }

      render(<NodeDetailsPanel node={loopNode} onClose={mockOnClose} />)

      expect(screen.getByRole('heading', { name: 'While Loop' })).toBeInTheDocument()
      expect(screen.getByTestId('logic-node-form')).toBeInTheDocument()
    })
  })

  describe('Converge Node', () => {
    it('renders converge node details panel', () => {
      const convergeNode: Node<NodeType['data']> = {
        id: 'converge-1',
        type: 'converge',
        position: { x: 0, y: 0 },
        data: {
          type: 'converge',
          id: 'converge-1',
          name: 'Test Converge',
          converge: {
            branches: [],
            strategy: 'all',
          },
        },
      }

      render(<NodeDetailsPanel node={convergeNode} onClose={mockOnClose} />)

      expect(screen.getByRole('heading', { name: 'Test Converge' })).toBeInTheDocument()
      expect(screen.getByTestId('logic-node-form')).toBeInTheDocument()
    })
  })

  describe('Fallback Rendering', () => {
    it('renders fallback view for unsupported node types', () => {
      const unsupportedNode: Node<NodeType['data']> = {
        id: 'email-1',
        type: 'email' as NodeType['data']['type'],
        position: { x: 0, y: 0 },
        data: {
          type: 'email' as NodeType['data']['type'],
          id: 'email-1',
          name: 'Test Email',
        },
      }

      render(<NodeDetailsPanel node={unsupportedNode} onClose={mockOnClose} />)

      expect(screen.getByText('Node Type')).toBeInTheDocument()
      expect(screen.getByText('email')).toBeInTheDocument()
      expect(screen.getByText('Node ID')).toBeInTheDocument()
      expect(screen.getByText('email-1')).toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('updates task activity on successful submission', async () => {
      const user = userEvent.setup()
      const taskNode: Node<NodeType['data']> = {
        id: 'task-1',
        type: 'task',
        position: { x: 0, y: 0 },
        data: {
          type: 'task',
          id: 'task-1',
          name: 'Original Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("original")',
            },
          },
        },
      }

      render(<NodeDetailsPanel node={taskNode} onClose={mockOnClose} />)

      await user.click(screen.getByRole('button', { name: 'Update node' }))

      expect(mockUpdateActivity).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          name: 'Updated Task',
        })
      )
    })

    it('updates condition activity on successful submission', async () => {
      const user = userEvent.setup()
      const conditionNode: Node<NodeType['data']> = {
        id: 'condition-1',
        type: 'condition',
        position: { x: 0, y: 0 },
        data: {
          type: 'condition',
          id: 'condition-1',
          name: 'Original Condition',
          condition: 'input.value > 5',
        },
      }

      render(<NodeDetailsPanel node={conditionNode} onClose={mockOnClose} />)

      await user.click(screen.getByRole('button', { name: 'Update node' }))

      expect(mockUpdateActivity).toHaveBeenCalledWith(
        'condition-1',
        expect.objectContaining({
          name: 'Updated Logic',
          condition: 'true',
        })
      )
    })

    it('shows error when submission fails', async () => {
      const user = userEvent.setup()
      mockUpdateActivity.mockImplementation(() => {
        throw new Error('Update failed')
      })

      const taskNode: Node<NodeType['data']> = {
        id: 'task-1',
        type: 'task',
        position: { x: 0, y: 0 },
        data: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("test")',
            },
          },
        },
      }

      render(<NodeDetailsPanel node={taskNode} onClose={mockOnClose} />)

      await user.click(screen.getByRole('button', { name: 'Update node' }))

      expect(mockShowError).toHaveBeenCalledWith('Update failed', 'Update Failed')
    })
  })

  describe('Form Cancellation', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup()
      const taskNode: Node<NodeType['data']> = {
        id: 'task-1',
        type: 'task',
        position: { x: 0, y: 0 },
        data: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("test")',
            },
          },
        },
      }

      render(<NodeDetailsPanel node={taskNode} onClose={mockOnClose} />)

      await user.click(screen.getByTestId('form-cancel'))

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Panel Close', () => {
    it('calls onClose when close button in header is clicked', async () => {
      const user = userEvent.setup()
      const taskNode: Node<NodeType['data']> = {
        id: 'task-1',
        type: 'task',
        position: { x: 0, y: 0 },
        data: {
          type: 'task',
          id: 'task-1',
          name: 'Test Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("test")',
            },
          },
        },
      }

      render(<NodeDetailsPanel node={taskNode} onClose={mockOnClose} />)

      // The close button is rendered by SidePanel component
      const buttons = screen.getAllByRole('button')
      const closeButton = buttons[0] // First button should be the X close button
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Node Title', () => {
    it('displays trigger node title correctly', () => {
      const triggerNode: Node<NodeType['data']> = {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {
          label: 'Manual Trigger',
          inputs: {},
        },
      }

      render(<NodeDetailsPanel node={triggerNode} onClose={mockOnClose} />)

      expect(screen.getByText('Trigger Details')).toBeInTheDocument()
    })

    it('displays task node name as title', () => {
      const taskNode: Node<NodeType['data']> = {
        id: 'task-1',
        type: 'task',
        position: { x: 0, y: 0 },
        data: {
          type: 'task',
          id: 'task-1',
          name: 'My Custom Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("test")',
            },
          },
        },
      }

      render(<NodeDetailsPanel node={taskNode} onClose={mockOnClose} />)

      expect(screen.getByRole('heading', { name: 'My Custom Task' })).toBeInTheDocument()
    })

    it('displays default title for unknown node types', () => {
      const unknownNode: Node<NodeType['data']> = {
        id: 'unknown-1',
        type: 'parallel',
        position: { x: 0, y: 0 },
        data: {},
      }

      render(<NodeDetailsPanel node={unknownNode} onClose={mockOnClose} />)

      expect(screen.getByText('Node Details')).toBeInTheDocument()
    })
  })
})
