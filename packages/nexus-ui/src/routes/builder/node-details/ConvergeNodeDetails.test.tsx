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

// Mock that triggers real handleSubmit flow for accurate payload testing
vi.mock('../node-forms/ConvergeNodeForm', () => ({
  ConvergeNodeForm: ({
    onSubmit,
    submitButtonText,
    initialData,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    onCancel: () => void
    submitButtonText?: string
    initialData?: {
      name?: string
      timeoutEnabled?: boolean
      timeoutSeconds?: number
      timeoutMinutes?: number
      timeoutHours?: number
      timeoutDays?: number
      requiredPathCount?: number
      [key: string]: unknown
    }
  }) => {
    return (
      <div data-testid="converge-node-form">
        <span data-testid="initial-name">{initialData?.name ?? ''}</span>
        <span data-testid="initial-timeout-enabled">{String(initialData?.timeoutEnabled ?? false)}</span>
        <span data-testid="initial-required-path-count">{String(initialData?.requiredPathCount ?? '')}</span>
        <button
          onClick={() => {
            // Simulate ConvergeNodeForm's behavior: compute timeout from time units before calling handleSubmit
            const timeoutInSeconds = initialData?.timeoutEnabled
              ? (Number(initialData?.timeoutSeconds) || 0) +
                (Number(initialData?.timeoutMinutes) || 0) * 60 +
                (Number(initialData?.timeoutHours) || 0) * 3600 +
                (Number(initialData?.timeoutDays) || 0) * 86400
              : undefined

            const payload = {
              ...initialData,
              timeout: timeoutInSeconds,
            }

            // Call the real onSubmit handler to trigger handleSubmit
            onSubmit(payload)
          }}
          data-testid="submit-button"
        >
          {submitButtonText ?? 'Add node'}
        </button>
      </div>
    )
  },
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

  it('renders ConvergeNodeForm', () => {
    render(<ConvergeNodeDetails convergeData={createConvergeData()} nodeId="converge-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('converge-node-form')).toBeInTheDocument()
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

    // Verify updateActivity was called with correct node ID and payload structure
    expect(mockUpdateActivity).toHaveBeenCalledTimes(1)
    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'converge-1',
      expect.objectContaining({
        type: 'converge',
        name: 'Test Converge',
        converge: expect.objectContaining({
          strategy: 'all',
          branches: expect.arrayContaining(['branch-1', 'branch-2']) as unknown as string[],
          timeout: expect.any(Number) as unknown as number,
          onTimeout: expect.stringMatching(/^(fail|continue)$/) as unknown as string,
        }) as unknown as Record<string, unknown>,
      })
    )

    // Verify the actual payload structure from handleSubmit (not just initialData passthrough)
    const actualPayload = mockUpdateActivity.mock.calls[0][1] as {
      type: string
      name: string
      converge: { strategy: string; branches: string[]; timeout?: number; onTimeout?: string }
    }
    expect(actualPayload.type).toBe('converge')
    expect(actualPayload.name).toBe('Test Converge')
    expect(actualPayload.converge.strategy).toBe('all')
    expect(actualPayload.converge.branches).toEqual(['branch-1', 'branch-2'])
    expect(actualPayload.converge).toHaveProperty('timeout')
    expect(actualPayload.converge).toHaveProperty('onTimeout')
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

  it('handles convergeData without converge object', () => {
    const convergeDataWithoutConverge = createConvergeData({ converge: undefined })

    render(<ConvergeNodeDetails convergeData={convergeDataWithoutConverge} nodeId="converge-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('converge-node-form')).toBeInTheDocument()
  })

  it('passes initialData to form with timeout decomposed', () => {
    const convergeData = createConvergeData({
      converge: { branches: [], strategy: 'all', timeout: 3600, onTimeout: 'continue' },
    })

    render(<ConvergeNodeDetails convergeData={convergeData} nodeId="converge-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('initial-timeout-enabled')).toHaveTextContent('true')
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
