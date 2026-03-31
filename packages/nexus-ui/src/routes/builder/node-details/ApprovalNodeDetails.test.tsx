import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ApprovalNodeDetails } from './ApprovalNodeDetails'

// Mock the workflow store
const mockUpdateActivity = vi.fn()
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: vi.fn((selector?: (store: { updateActivity: typeof mockUpdateActivity }) => unknown) => {
    const store = {
      updateActivity: mockUpdateActivity,
    }
    return selector ? selector(store) : store
  }),
}))

// Mock the alerts hook
const mockShowError = vi.fn()
vi.mock('../../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: mockShowError,
  })),
}))

// Mock ApprovalNodeForm
vi.mock('../node-forms/ApprovalNodeForm', () => ({
  ApprovalNodeForm: ({
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
    <div data-testid="approval-node-form">
      <span data-testid="initial-name">{initialData?.name as string}</span>
      <button
        onClick={() =>
          onSubmit({
            name: 'Updated Approval',
            approvers: ['admin'],
            prompt: 'Please approve',
            timeout: 3600,
            onTimeout: 'reject',
          })
        }
        data-testid="submit-button"
      >
        {submitButtonText ?? 'Add node'}
      </button>
      <button onClick={onCancel} data-testid="cancel-button">
        Cancel
      </button>
    </div>
  ),
}))

describe('ApprovalNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  const createTaskData = (overrides = {}) => ({
    type: 'task' as const,
    id: 'approval-1',
    name: 'Test Approval',
    task: {
      executor: 'script' as const,
      config: { language: 'python' as const, code: '' },
    },
    approval: {
      approvers: ['user1', 'user2'],
      prompt: 'Please review',
      timeout: 7200,
      onTimeout: 'reject' as const,
    },
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders ApprovalNodeForm', () => {
    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('approval-node-form')).toBeInTheDocument()
  })

  it('passes initial data from taskData to form', () => {
    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('initial-name')).toHaveTextContent('Test Approval')
  })

  it('calls updateActivity on successful form submission', async () => {
    const user = userEvent.setup()

    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'approval-1',
      expect.objectContaining({
        name: 'Updated Approval',
        requiresApproval: true,
        approval: expect.objectContaining({
          approvers: ['admin'],
          prompt: 'Please approve',
        }) as Record<string, unknown>,
      })
    )
  })

  it('calls onClose after successful submission', async () => {
    const user = userEvent.setup()

    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('displays "Update node" as submit button text', () => {
    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByText('Update node')).toBeInTheDocument()
  })

  it('handles taskData without approval data', () => {
    const taskDataWithoutApproval = createTaskData({ approval: undefined })

    render(<ApprovalNodeDetails taskData={taskDataWithoutApproval} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('approval-node-form')).toBeInTheDocument()
  })

  it('shows error when updateActivity throws', async () => {
    const user = userEvent.setup()
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('Update failed')
    })

    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockShowError).toHaveBeenCalledWith('Update failed')
  })
})
