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
vi.mock('../../../providers/alerts', () => ({
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
    parameters: {},
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

    mockOnSubmitHandler?.({
      name: 'Updated Approval',
      approvers: ['admin'],
      prompt: 'Please approve',
    })

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'approval-1',
      expect.objectContaining({
        name: 'Updated Approval',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        parameters: expect.objectContaining({
          approvers: ['admin'],
          prompt: 'Please approve',
        }),
      })
    )
  })

  it('calls onClose after auto-save', () => {
    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    mockOnSubmitHandler?.({
      name: 'Updated Approval',
      approvers: ['admin'],
      prompt: 'Please approve',
    })

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('handles taskData without config', () => {
    const taskDataWithoutConfig = createTaskData({ config: undefined })

    render(<ApprovalNodeDetails taskData={taskDataWithoutConfig} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('approval-node-form')).toBeInTheDocument()
  })

  it('shows error when updateActivity throws', () => {
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('The update failed')
    })

    render(<ApprovalNodeDetails taskData={createTaskData()} nodeId="approval-1" onClose={mockOnClose} />)

    mockOnSubmitHandler?.({
      name: 'Test Approval',
      approvers: ['user1'],
      prompt: 'Approve',
    })

    expect(mockShowError).toHaveBeenCalledWith({ title: 'Update failed', description: 'The update failed' })
  })

  it('passes settings from taskData to form', () => {
    const taskDataWithSettings = createTaskData({
      parameters: { decision_window: 7200 },
      settings: { continue_on_failure: true },
    })

    render(<ApprovalNodeDetails taskData={taskDataWithSettings} nodeId="approval-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('approval-node-form')).toBeInTheDocument()
  })
})
