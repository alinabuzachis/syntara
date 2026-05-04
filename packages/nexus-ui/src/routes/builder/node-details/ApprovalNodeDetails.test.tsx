import { render, screen } from '@testing-library/react'
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

// Mock ApprovalNodeForm - simulates auto-save behavior
let mockOnSubmitHandler: ((data: Record<string, unknown>) => void) | null = null

vi.mock('../node-forms/ApprovalNodeForm', () => ({
  ApprovalNodeForm: ({
    onSubmit,
    initialData,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    initialData?: Record<string, unknown>
  }) => {
    mockOnSubmitHandler = onSubmit
    return (
      <div data-testid="approval-node-form">
        <span data-testid="initial-name">{initialData?.name as string}</span>
      </div>
    )
  },
}))

describe('ApprovalNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  const createTaskData = (overrides = {}) => ({
    type: 'approval' as const,
    id: 'approval-1',
    name: 'Test Approval',
    config: {
      approver_timeout: 7200,
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

  it('calls updateActivity when form auto-saves', () => {
    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    // Simulate auto-save
    mockOnSubmitHandler?.({
      name: 'Updated Approval',
      approvers: ['admin'],
      prompt: 'Please approve',
      timeout: 3600,
      onTimeout: 'reject',
    })

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'approval-1',
      expect.objectContaining({
        name: 'Updated Approval',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          approvers: ['admin'],
          prompt: 'Please approve',
          approver_timeout: 3600,
          on_timeout: 'reject',
        }),
      })
    )
  })

  it('calls onClose after auto-save', () => {
    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    // Simulate auto-save
    mockOnSubmitHandler?.({
      name: 'Updated Approval',
      approvers: ['admin'],
      prompt: 'Please approve',
      timeout: 3600,
      onTimeout: 'reject',
    })

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('renders form with initial data', () => {
    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('approval-node-form')).toBeInTheDocument()
  })

  it('handles taskData without approval data', () => {
    const taskDataWithoutApproval = createTaskData({ approval: undefined })

    render(<ApprovalNodeDetails taskData={taskDataWithoutApproval} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('approval-node-form')).toBeInTheDocument()
  })

  it('shows error when updateActivity throws', () => {
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('The update failed')
    })

    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    // Simulate auto-save
    mockOnSubmitHandler?.({
      name: 'Test Approval',
      approvers: ['user1'],
      prompt: 'Approve',
      timeout: 86400,
      onTimeout: 'fail',
    })

    expect(mockShowError).toHaveBeenCalledWith({ title: 'Update failed', description: 'The update failed' })
  })

  it('reads on_timeout from snake_case config field', () => {
    const taskDataWithSnakeCase = createTaskData({
      config: {
        approver_timeout: 7200,
        on_timeout: 'continue',
      },
    })

    render(<ApprovalNodeDetails taskData={taskDataWithSnakeCase} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('approval-node-form')).toBeInTheDocument()
  })

  it('falls back to onTimeout (camelCase) when on_timeout not present', () => {
    const taskDataWithCamelCase = createTaskData({
      config: {
        approver_timeout: 7200,
        onTimeout: 'continue',
      },
    })

    render(<ApprovalNodeDetails taskData={taskDataWithCamelCase} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('approval-node-form')).toBeInTheDocument()
  })

  it('prefers on_timeout over onTimeout when both present', () => {
    const taskDataWithBoth = createTaskData({
      config: {
        approver_timeout: 7200,
        on_timeout: 'continue',
        onTimeout: 'reject',
      },
    })

    render(<ApprovalNodeDetails taskData={taskDataWithBoth} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('approval-node-form')).toBeInTheDocument()
  })
})
