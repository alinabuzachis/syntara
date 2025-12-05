import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { LoopNodeDetails } from './LoopNodeDetails'

// Mock the workflow store
const mockUpdateActivity = vi.fn()
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: vi.fn((selector) => {
    const store = {
      updateActivity: mockUpdateActivity,
    }
    return selector ? selector(store) : store
  }),
}))

// Mock the alerts hook
vi.mock('@ansible/nexus-ui-framework', async () => {
  const actual = await vi.importActual('@ansible/nexus-ui-framework')
  return {
    ...actual,
    useAlerts: vi.fn(() => ({
      showSuccess: vi.fn(),
      showError: vi.fn(),
    })),
  }
})

// Mock LogicNodeForm
vi.mock('../node-forms/LogicNodeForm', () => ({
  LogicNodeForm: ({
    onSubmit,
    onCancel,
    submitButtonText,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    onCancel: () => void
    submitButtonText?: string
  }) => (
    <div data-testid="logic-node-form">
      <button
        onClick={() =>
          onSubmit({
            name: 'Updated Loop',
            type: 'forEach',
            items: 'input.newItems',
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

describe('LoopNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders LogicNodeForm', () => {
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Test Loop',
      loop: {
        type: 'forEach' as const,
        items: 'input.items',
        do: [],
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('logic-node-form')).toBeInTheDocument()
  })

  it('calls updateActivity on successful form submission', async () => {
    const user = userEvent.setup()
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Original Loop',
      loop: {
        type: 'forEach' as const,
        items: 'input.items',
        do: [],
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'loop-1',
      expect.objectContaining({
        name: 'Updated Loop',
        loop: expect.objectContaining({
          type: 'forEach',
          items: 'input.newItems',
        }),
      })
    )
  })

  it('displays "Update node" as submit button text', () => {
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Loop',
      loop: {
        type: 'while' as const,
        condition: 'counter < 10',
        do: [],
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    expect(screen.getByText('Update node')).toBeInTheDocument()
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Loop',
      loop: {
        type: 'count' as const,
        count: 5,
        do: [],
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('cancel-button'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })
})
