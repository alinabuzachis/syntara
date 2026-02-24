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

// Use real timeUtils helpers (secondsToTimeUnits is now imported directly in ConvergeNodeDetails)
vi.mock('../utils/timeUtils', async (importOriginal) => importOriginal())

vi.mock('../node-forms/LogicNodeForm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../node-forms/LogicNodeForm')>()
  return {
    ...actual,
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
        <span data-testid="initial-timeout-enabled">{String(initialData?.timeoutEnabled ?? false)}</span>
        <span data-testid="initial-required-path-count">{String(initialData?.requiredPathCount ?? '')}</span>
        <button
          onClick={() =>
            onSubmit({
              name: 'Updated Converge',
              strategy: 'all',
              timeout: 3600,
              onTimeout: 'continue',
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
              strategy: 'all',
            })
          }
          data-testid="submit-without-timeout"
        >
          Submit without timeout
        </button>
        <button
          onClick={() =>
            onSubmit({
              name: 'Converge Cleared Timeout',
              strategy: 'all',
              timeout: undefined,
              onTimeout: undefined,
            })
          }
          data-testid="submit-clear-timeout"
        >
          Submit clear timeout
        </button>
        <button onClick={onCancel} data-testid="cancel-button">
          Cancel
        </button>
      </div>
    ),
  }
})

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
    expect(screen.getByTestId('initial-timeout-enabled')).toHaveTextContent('true')
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
          strategy: 'all',
          timeout: 3600,
          onTimeout: 'continue',
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
          strategy: 'all',
        }),
      })
    )
    const call = mockUpdateActivity.mock.calls[0][1]
    expect(call.converge).not.toHaveProperty('timeout')
    expect(call.converge).not.toHaveProperty('onTimeout')
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

  describe('timeout toggle state initialization', () => {
    it('sets timeoutEnabled true and decomposes time units when converge has timeout', () => {
      render(
        <ConvergeNodeDetails
          convergeData={createConvergeData({ converge: { branches: [], strategy: 'all', timeout: 3600 } })}
          nodeId="converge-1"
          onClose={mockOnClose}
        />
      )

      expect(screen.getByTestId('initial-timeout-enabled')).toHaveTextContent('true')
    })

    it('sets timeoutEnabled false when converge has no timeout', () => {
      render(
        <ConvergeNodeDetails
          convergeData={createConvergeData({ converge: { branches: [], strategy: 'all' } })}
          nodeId="converge-1"
          onClose={mockOnClose}
        />
      )

      expect(screen.getByTestId('initial-timeout-enabled')).toHaveTextContent('false')
    })
  })

  it('clearing timeout on save removes timeout and onTimeout from converge', async () => {
    const user = userEvent.setup()

    render(
      <ConvergeNodeDetails
        convergeData={createConvergeData({
          converge: { branches: [], strategy: 'all', timeout: 7200, onTimeout: 'fail' },
        })}
        nodeId="converge-1"
        onClose={mockOnClose}
      />
    )

    await user.click(screen.getByTestId('submit-clear-timeout'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'converge-1',
      expect.objectContaining({
        name: 'Converge Cleared Timeout',
        converge: expect.not.objectContaining({
          timeout: expect.anything(),
          onTimeout: expect.anything(),
        }),
      })
    )
    const call = mockUpdateActivity.mock.calls[0][1]
    expect(call.converge).not.toHaveProperty('timeout')
    expect(call.converge).not.toHaveProperty('onTimeout')
  })

  it('defaults requiredPathCount to 1 in edit form when not previously set', () => {
    render(
      <ConvergeNodeDetails
        convergeData={createConvergeData({ converge: { branches: [], strategy: 'all' } })}
        nodeId="converge-1"
        onClose={mockOnClose}
      />
    )

    expect(screen.getByTestId('initial-required-path-count')).toHaveTextContent('1')
  })
})
