import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ConvergeNodeDetails } from './ConvergeNodeDetails'

// Mock the workflow store
const mockUpdateActivity = vi.fn()
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStoreActions: vi.fn(() => ({
    updateActivity: mockUpdateActivity,
  })),
}))

// Mock the alerts hook
const mockShowError = vi.fn()
vi.mock('../../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: mockShowError,
  })),
}))

// Mock LogicNodeForm
vi.mock('../node-forms/LogicNodeForm', () => ({
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
      <span data-testid="initial-name">{initialData?.name as string}</span>
      <span data-testid="initial-timeout">{initialData?.timeout as string}</span>
      <button
        onClick={() =>
          onSubmit({
            name: 'Updated Converge',
            timeout: 3600,
            onTimeout: 'continue',
            aggregateOutputs: false,
          })
        }
        data-testid="submit-button"
      >
        {submitButtonText || 'Add node'}
      </button>
      <button
        onClick={() =>
          onSubmit({
            name: 'Converge Without Timeout',
          })
        }
        data-testid="submit-without-timeout"
      >
        Submit without timeout
      </button>
      <button onClick={onCancel} data-testid="cancel-button">
        Cancel
      </button>
    </div>
  ),
}))

describe('ConvergeNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  const createConvergeData = (overrides = {}) => ({
    type: 'converge' as const,
    id: 'converge-1',
    name: 'Test Converge',
    converge: {
      branches: ['branch-1', 'branch-2'],
      strategy: 'all' as const,
      timeout: 7200,
      onTimeout: 'fail' as const,
      aggregateOutputs: true,
    },
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders LogicNodeForm', () => {
    render(<ConvergeNodeDetails convergeData={createConvergeData()} nodeId="converge-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('logic-node-form')).toBeInTheDocument()
  })

  it('passes initial data from convergeData to form', () => {
    render(<ConvergeNodeDetails convergeData={createConvergeData()} nodeId="converge-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('initial-name')).toHaveTextContent('Test Converge')
    expect(screen.getByTestId('initial-timeout')).toHaveTextContent('7200')
  })

  it('calls updateActivity on successful form submission', async () => {
    const user = userEvent.setup()

    render(<ConvergeNodeDetails convergeData={createConvergeData()} nodeId="converge-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'converge-1',
      expect.objectContaining({
        name: 'Updated Converge',
        converge: expect.objectContaining({
          timeout: 3600,
          onTimeout: 'continue',
          aggregateOutputs: false,
        }),
      })
    )
  })

  it('calls onClose after successful submission', async () => {
    const user = userEvent.setup()

    render(<ConvergeNodeDetails convergeData={createConvergeData()} nodeId="converge-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('displays "Update node" as submit button text', () => {
    render(<ConvergeNodeDetails convergeData={createConvergeData()} nodeId="converge-1" onClose={mockOnClose} />)

    expect(screen.getByText('Update node')).toBeInTheDocument()
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()

    render(<ConvergeNodeDetails convergeData={createConvergeData()} nodeId="converge-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('cancel-button'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('handles convergeData without converge object', () => {
    const convergeDataWithoutConverge = createConvergeData({ converge: undefined })

    render(<ConvergeNodeDetails convergeData={convergeDataWithoutConverge} nodeId="converge-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('logic-node-form')).toBeInTheDocument()
  })

  it('handles submission without timeout', async () => {
    const user = userEvent.setup()

    render(<ConvergeNodeDetails convergeData={createConvergeData()} nodeId="converge-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-without-timeout'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'converge-1',
      expect.objectContaining({
        name: 'Converge Without Timeout',
        converge: expect.objectContaining({
          onTimeout: 'fail',
          aggregateOutputs: true,
        }),
      })
    )
  })

  it('shows error when updateActivity throws', async () => {
    const user = userEvent.setup()
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('Update failed')
    })

    render(<ConvergeNodeDetails convergeData={createConvergeData()} nodeId="converge-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockShowError).toHaveBeenCalledWith('Update failed', 'Update Failed')
  })
})
