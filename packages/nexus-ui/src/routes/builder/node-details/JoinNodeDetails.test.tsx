import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { JoinNodeDetails } from './JoinNodeDetails'

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
    initialData,
  }: {
    onSubmit: (data: Record<string, unknown>) => void
    onCancel: () => void
    submitButtonText?: string
    initialData?: Record<string, unknown>
  }) => (
    <div data-testid="logic-node-form">
      <div data-testid="initial-name">{initialData?.name}</div>
      <div data-testid="initial-join-strategy">{initialData?.joinStrategy}</div>
      {initialData?.joinCount !== undefined && <div data-testid="initial-join-count">{initialData.joinCount}</div>}
      <button
        onClick={() =>
          onSubmit({
            name: 'Updated Join',
            joinStrategy: 'majority',
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

describe('JoinNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders LogicNodeForm with join data', () => {
    const joinData = {
      type: 'join' as const,
      id: 'join-1',
      name: 'Test Join',
      join: {
        strategy: 'all' as const,
        branches: [],
      },
    }

    render(<JoinNodeDetails joinData={joinData} nodeId="join-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('logic-node-form')).toBeInTheDocument()
    expect(screen.getByTestId('initial-name')).toHaveTextContent('Test Join')
    expect(screen.getByTestId('initial-join-strategy')).toHaveTextContent('all')
  })

  it('renders join strategy with count when strategy is count', () => {
    const joinData = {
      type: 'join' as const,
      id: 'join-1',
      name: 'Count Join',
      join: {
        strategy: 'count' as const,
        count: 3,
        branches: [],
      },
    }

    render(<JoinNodeDetails joinData={joinData} nodeId="join-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('initial-join-strategy')).toHaveTextContent('count')
    expect(screen.getByTestId('initial-join-count')).toHaveTextContent('3')
  })

  it('calls updateActivity on successful form submission', async () => {
    const user = userEvent.setup()
    const joinData = {
      type: 'join' as const,
      id: 'join-1',
      name: 'Original Join',
      join: {
        strategy: 'all' as const,
        branches: [],
      },
    }

    render(<JoinNodeDetails joinData={joinData} nodeId="join-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('submit-button'))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'join-1',
      expect.objectContaining({
        name: 'Updated Join',
        join: expect.objectContaining({
          strategy: 'majority',
        }),
      })
    )
  })

  it('displays "Update node" as submit button text', () => {
    const joinData = {
      type: 'join' as const,
      id: 'join-1',
      name: 'Join',
      join: {
        strategy: 'any' as const,
        branches: [],
      },
    }

    render(<JoinNodeDetails joinData={joinData} nodeId="join-1" onClose={mockOnClose} />)

    expect(screen.getByText('Update node')).toBeInTheDocument()
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const joinData = {
      type: 'join' as const,
      id: 'join-1',
      name: 'Join',
      join: {
        strategy: 'majority' as const,
        branches: [],
      },
    }

    render(<JoinNodeDetails joinData={joinData} nodeId="join-1" onClose={mockOnClose} />)

    await user.click(screen.getByTestId('cancel-button'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('handles null safety when join data is undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const joinData: any = {
      type: 'join' as const,
      id: 'join-1',
      name: 'Join',
      join: undefined,
    }

    render(<JoinNodeDetails joinData={joinData} nodeId="join-1" onClose={mockOnClose} />)

    expect(screen.getByTestId('logic-node-form')).toBeInTheDocument()
    expect(screen.getByTestId('initial-join-strategy')).toHaveTextContent('all')
  })
})
