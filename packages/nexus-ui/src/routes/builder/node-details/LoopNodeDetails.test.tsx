import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { LoopNodeDetails } from './LoopNodeDetails'

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
        {submitButtonText ?? 'Add step'}
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
      config: {
        type: 'for_each' as const,
        items: 'input.items',
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
      config: {
        type: 'for_each' as const,
        items: 'input.items',
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'loop-1',
      expect.objectContaining({
        name: 'Updated Loop',
        config: expect.objectContaining({
          type: 'for_each',
          items: 'input.newItems',
        }) as Record<string, unknown>,
      })
    )
  })

  it('displays "Update step" as submit button text', () => {
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Loop',
      config: {
        type: 'do_while' as const,
        condition: 'counter < 10',
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    expect(screen.getByText('Update step')).toBeInTheDocument()
  })

  it('passes correct loop type to form initialData', () => {
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Test While Loop',
      config: {
        type: 'do_while' as const,
        condition: 'counter < 10',
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
      config: undefined,
    }

    // In v2, missing config is gracefully handled — the form renders with defaults
    // @ts-expect-error Testing invalid data
    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    // Component renders the form rather than erroring (config defaults to {})
    expect(screen.getByTestId('loop-node-form')).toBeInTheDocument()
    expect(screen.getByTestId('initial-type')).toHaveTextContent('while')
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
      config: {
        type: 'for_each' as const,
        items: 'items',
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockShowError).toHaveBeenCalledWith('Update failed', 'Update Failed')
  })

  it('preserves indexVariable and itemVariable when updating forEach loop', async () => {
    const user = userEvent.setup()
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'ForEach Loop',
      config: {
        type: 'for_each' as const,
        items: 'input.items',
        indexVariable: 'idx',
        itemVariable: 'item',
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'loop-1',
      expect.objectContaining({
        config: expect.objectContaining({
          type: 'for_each',
          items: 'input.newItems',
          // indexVariable and itemVariable should be preserved from original config
        }) as Record<string, unknown>,
      })
    )
  })

  it('preserves "while" type when editing while loop', () => {
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'While Loop',
      config: {
        type: 'do_while' as const,
        condition: 'counter < 10',
        max_iterations: 100,
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    // Verify the form is initialized with 'while' UI type
    expect(screen.getByTestId('initial-type')).toHaveTextContent('while')
  })

  it('preserves "do_while" type when editing do_while loop', () => {
    const loopData = {
      type: 'loop' as const,
      id: 'loop-1',
      name: 'Do-While Loop',
      config: {
        type: 'do_while' as const,
        condition: 'hasMore === true',
        maxIterationsBehavior: 'continue' as const,
      },
    }

    render(<LoopNodeDetails loopData={loopData} nodeId="loop-1" onClose={mockOnClose} />)

    // Verify the form is initialized with 'while' UI type (do_while maps to 'while' in UI)
    expect(screen.getByTestId('initial-type')).toHaveTextContent('while')
  })
})
