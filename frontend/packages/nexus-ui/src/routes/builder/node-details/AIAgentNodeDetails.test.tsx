import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { createAgenticActivity } from '../../../stores/useWorkflowStore'

import { AIAgentNodeDetails } from './AIAgentNodeDetails'

// Mock the workflow store
const mockUpdateActivity = vi.fn()
vi.mock('../../../stores/useWorkflowStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../stores/useWorkflowStore')>()),
  useWorkflowStore: vi.fn((selector?: (store: { updateActivity: typeof mockUpdateActivity }) => unknown) => {
    const store = {
      updateActivity: mockUpdateActivity,
    }
    return selector ? selector(store) : store
  }),
  useWorkflowStoreActions: vi.fn(() => ({
    updateActivity: mockUpdateActivity,
  })),
  createAgenticActivity: vi.fn(
    (options: {
      id: string
      name: string
      tools?: string[]
      prompt?: string
      model?: string
      inputs?: string
      fileIds?: string[]
    }) => ({
      type: 'agentic',
      id: options.id,
      name: options.name,
      config: {
        ...(options.tools && options.tools.length > 0 && { tool_selections: options.tools }),
        ...(options.prompt && { prompt: options.prompt }),
        ...(options.model && { model: options.model }),
        ...(options.fileIds && options.fileIds.length > 0 && { file_ids: options.fileIds }),
      },
    })
  ),
}))

// Mock the alerts hook
const mockShowError = vi.fn()
vi.mock('../../../providers/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: mockShowError,
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
    initialData?: { name?: string; model?: string; prompt?: string; tools?: string }
    submitButtonText?: string
  }) => (
    <div data-testid="ai-agent-form">
      <div data-testid="initial-name">{initialData?.name ?? ''}</div>
      <div data-testid="initial-model">{initialData?.model ?? ''}</div>
      <div data-testid="initial-prompt">{initialData?.prompt ?? ''}</div>
      <div data-testid="initial-tools">{initialData?.tools ?? ''}</div>
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
        {submitButtonText ?? 'Add step'}
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
      type: 'agentic' as const,
      id: 'agent-1',
      name: 'Original Agent',
      config: {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: 'Original prompt',
      },
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({
        type: 'agentic',
        id: 'agent-1',
        name: 'Updated Agent',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          model: 'gpt-4',
          prompt: 'Updated prompt',
          tool_selections: ['calculator', 'web_search'],
        }),
      })
    )
  })

  it('calls onClose after successful update', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'agentic' as const,
      id: 'agent-1',
      name: 'Test Agent',
      config: {},
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('handles empty tools array', () => {
    const taskData = {
      type: 'agentic' as const,
      id: 'agent-1',
      name: 'Test Agent',
      config: {
        tool_selections: [],
      },
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('initial-tools')).toHaveTextContent('')
  })

  it('shows error when updateActivity throws', async () => {
    const user = userEvent.setup()
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('The update failed')
    })
    const taskData = {
      type: 'agentic' as const,
      id: 'agent-1',
      name: 'Test Agent',
      config: {},
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockShowError).toHaveBeenCalledWith({ title: 'Update failed', description: 'The update failed' })
  })

  it('preserves task inputs when updating', async () => {
    const user = userEvent.setup()
    const taskData = {
      type: 'agentic' as const,
      id: 'agent-1',
      name: 'Test Agent',
      config: {},
    }

    render(<AIAgentNodeDetails taskData={taskData} nodeId="agent-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(createAgenticActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-1',
        name: 'Updated Agent',
      })
    )
    expect(mockUpdateActivity).toHaveBeenCalled()
  })
})
