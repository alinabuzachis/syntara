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

// Mock LoopNodeForm
vi.mock('../node-forms/LoopNodeForm', () => ({
  LoopNodeForm: ({
    onSubmit,
    submitButtonText,
    initialData,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    submitButtonText?: string
    initialData?: Record<string, unknown>
  }) => (
    <div data-testid="loop-node-form">
      <span data-testid="initial-type">{initialData?.type as string}</span>
      <span data-testid="initial-name">{initialData?.name as string}</span>
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
    </div>
  ),
}))

describe('LoopNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders LoopNodeForm', () => {
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

    expect(screen.getByTestId('loop-node-form')).toBeInTheDocument()
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

  it('passes correct loop type to form initialData', () => {
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Test While Loop',
      loop: {
        type: 'while' as const,
        condition: 'counter < 10',
        do: [],
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('initial-type')).toHaveTextContent('while')
    expect(screen.getByTestId('initial-name')).toHaveTextContent('Test While Loop')
  })

  it('shows error and closes when loop data is missing', () => {
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Invalid Loop',
      loop: undefined,
    }

    // @ts-expect-error Testing invalid data
    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    expect(mockShowError).toHaveBeenCalledWith('Invalid loop node data', 'Error')
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows error when updateActivity throws', async () => {
    const user = userEvent.setup()
    mockUpdateActivity.mockImplementationOnce(() => {
      throw new Error('Update failed')
    })
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Loop',
      loop: {
        type: 'forEach' as const,
        items: 'items',
        do: [],
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockShowError).toHaveBeenCalledWith('Update failed', 'Update Failed')
  })
})
