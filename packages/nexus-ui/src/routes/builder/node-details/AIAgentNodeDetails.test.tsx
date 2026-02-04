import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { AIAgentNodeDetails } from './AIAgentNodeDetails'

// Mock the workflow store
const mockUpdateActivity = vi.fn()
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: vi.fn((selector) => {
    const store = {
      updateActivity: mockUpdateActivity,
    }
    return selector ? selector(store) : store
  }),
  useWorkflowStoreActions: vi.fn(() => ({
    updateActivity: mockUpdateActivity,
  })),
  createAgenticActivity: vi.fn((id, name, tools, prompt, model, inputs, fileIds) => ({
    type: 'task',
    id,
    name,
    task: {
      executor: 'agentic',
      config: {
        agent: '',
        ...(tools && { tools }),
        ...(prompt && { prompt }),
        ...(model && { model }),
        ...(fileIds && { fileIds }),
      },
    },
  })),
}))

// Mock the alerts hook
vi.mock('../../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  })),
}))

// Mock AIAgentNodeForm
vi.mock('../node-forms/AIAgentNodeForm', () => ({
  AIAgentNodeForm: ({
    onSubmit,
    onCancel,
    initialData,
    submitButtonText,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    onCancel: () => void
    initialData?: Record<string, unknown>
    submitButtonText?: string
  }) => (
    <div data-testid="ai-agent-form">
      <div data-testid="initial-name">{String(initialData?.name ?? '')}</div>
      <div data-testid="initial-model">{String(initialData?.model ?? '')}</div>
      <div data-testid="initial-prompt">{String(initialData?.prompt ?? '')}</div>
      <div data-testid="initial-tools">{String(initialData?.tools ?? '')}</div>
      <button
        onClick={() =>
          onSubmit({
            name: 'Updated Agent',
            model: 'gpt-4',
            prompt: 'Updated prompt',
            tools: 'calculator, web_search',
            fileIds: [],
          })
        }
        data-testid="submit-button"
      >
        {submitButtonText || 'Add node'}
      </button>
      <button onClick={onCancel} data-testid="cancel-button">
        Cancel
      </button>
    </div>
  ),
}))

describe('AIAgentNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls updateActivity on successful form submission', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'task' as const,
      id: 'agent-1',
      name: 'Original Agent',
      task: {
        executor: 'agentic' as const,
        config: {
          agent: '',
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Original prompt',
        },
      },
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({
        type: 'task',
        id: 'agent-1',
        name: 'Updated Agent',
        task: expect.objectContaining({
          executor: 'agentic',
          config: expect.objectContaining({
            model: 'gpt-4',
            prompt: 'Updated prompt',
            tools: ['calculator', 'web_search'],
          }),
        }),
      })
    )
  })

  it('calls onClose after successful update', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'task' as const,
      id: 'agent-1',
      name: 'Test Agent',
      task: {
        executor: 'agentic' as const,
        config: {
          agent: '',
        },
      },
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'task' as const,
      id: 'agent-1',
      name: 'Agent',
      task: {
        executor: 'agentic' as const,
        config: {
          agent: '',
        },
      },
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('cancel-button'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('handles empty tools array', () => {
    const taskData = {
      type: 'task' as const,
      id: 'agent-1',
      name: 'Test Agent',
      task: {
        executor: 'agentic' as const,
        config: {
          agent: '',
          tools: [],
        },
      },
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('initial-tools')).toHaveTextContent('')
  })

  it('preserves task inputs when updating', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'task' as const,
      id: 'agent-1',
      name: 'Test Agent',
      task: {
        executor: 'agentic' as const,
        config: {
          agent: '',
        },
        inputs: { key: 'value' },
      },
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalled()
  })
})
