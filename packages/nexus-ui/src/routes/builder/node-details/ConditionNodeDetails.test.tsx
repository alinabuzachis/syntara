import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ConditionNodeDetails } from './ConditionNodeDetails'

// Mock the workflow store
const mockUpdateActivity = vi.fn()
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: vi.fn((selector?: (store: { updateActivity: typeof mockUpdateActivity }) => unknown) => {
    const store = {
      updateActivity: mockUpdateActivity,
    }
    return selector ? selector(store) : store
  }),
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

// Mock ConditionNodeForm
vi.mock('../node-forms/ConditionNodeForm', () => ({
  ConditionNodeForm: ({
    onSubmit,
    submitButtonText,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    submitButtonText?: string
  }) => (
    <div data-testid="condition-node-form">
      <button onClick={() => onSubmit({ name: 'Updated Condition', condition: 'true' })} data-testid="submit-button">
        {submitButtonText ?? 'Add step'}
      </button>
    </div>
  ),
}))

describe('ConditionNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders ConditionNodeForm', () => {
    const conditionData = {
      type: 'condition' as const,
      id: 'condition-1',
      name: 'Test Condition',
      config: { condition: 'input.value > 10' },
    }

    render(<ConditionNodeDetails conditionData={conditionData} nodeId="condition-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('condition-node-form')).toBeInTheDocument()
  })

  it('calls updateActivity on successful form submission', async () => {
    const user = userEvent.setup()
    const conditionData = {
      type: 'condition' as const,
      id: 'condition-1',
      name: 'Original Condition',
      config: { condition: 'input.value > 5' },
    }

    render(<ConditionNodeDetails conditionData={conditionData} nodeId="condition-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'condition-1',
      expect.objectContaining({
        id: 'condition-1',
        type: 'condition',
        name: 'Updated Condition',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          condition: 'true',
        }),
      })
    )
  })

  it('displays "Update step" as submit button text', () => {
    const conditionData = {
      type: 'condition' as const,
      id: 'condition-1',
      name: 'Condition',
      config: { condition: 'test' },
    }

    render(<ConditionNodeDetails conditionData={conditionData} nodeId="condition-1" onClose={mockOnClose} />)

    expect(screen.getByText('Update step')).toBeInTheDocument()
  })

  it('shows error when updateActivity throws', async () => {
    const user = userEvent.setup()
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('Update failed')
    })
    const conditionData = {
      type: 'condition' as const,
      id: 'condition-1',
      name: 'Condition',
      config: { condition: 'test' },
    }

    render(<ConditionNodeDetails conditionData={conditionData} nodeId="condition-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockShowError).toHaveBeenCalledWith('Update failed', 'Update Failed')
  })
})
