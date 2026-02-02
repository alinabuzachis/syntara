import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ExecutionDetailsPanel } from './ExecutionDetailsPanel'

// Mock the workflow client
const mockExecutionQuery = {
  data: {
    id: 'exec-123',
    workflow_id: 'wf-123',
    status: 'running',
    started_at: '2024-01-01T00:00:00Z',
    activities: [
      {
        id: 'activity-1',
        activity_id: 'task-1',
        status: 'completed',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
      },
      {
        id: 'activity-2',
        activity_id: 'task-2',
        status: 'running',
        started_at: '2024-01-01T00:01:00Z',
      },
    ],
  },
  isLoading: false,
  error: null,
}

vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(() => mockExecutionQuery),
  },
}))

// Mock StatusLabel component
vi.mock('./ExecutionStatus', () => ({
  StatusLabel: ({ status }: { status: string }) => <div data-testid="status-label">{status}</div>,
}))

describe('ExecutionDetailsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders execution view title', () => {
    render(<ExecutionDetailsPanel executionId="exec-123" />)

    expect(screen.getByText('Execution View')).toBeInTheDocument()
  })

  it('does not render close button', () => {
    render(<ExecutionDetailsPanel executionId="exec-123" />)

    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument()
  })

  it('displays execution details', () => {
    render(<ExecutionDetailsPanel executionId="exec-123" />)

    expect(screen.getByText('Execution Details')).toBeInTheDocument()
    expect(screen.getByText('exec-123')).toBeInTheDocument()
    expect(screen.getByTestId('status-label')).toHaveTextContent('running')
  })

  it('shows elapsed time between status and execution id', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:30Z'))

    render(<ExecutionDetailsPanel executionId="exec-123" />)

    expect(screen.getByText('Elapsed time')).toBeInTheDocument()
    expect(screen.getByText('30s')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByText('32s')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('displays execution ID', () => {
    render(<ExecutionDetailsPanel executionId="exec-123" />)

    expect(screen.getByText('Execution ID')).toBeInTheDocument()
    expect(screen.getByText('exec-123')).toBeInTheDocument()
  })

  it('displays started at timestamp when available', () => {
    render(<ExecutionDetailsPanel executionId="exec-123" />)

    expect(screen.getByText('Started At')).toBeInTheDocument()
    // Timestamp is formatted as locale string (2024-01-01T00:00:00Z appears as 12/31/2023, 7:00:00 PM in local time)
    expect(screen.getByText(/2023|2024/)).toBeInTheDocument()
  })

  it('spans full width', () => {
    const { container } = render(<ExecutionDetailsPanel executionId="exec-123" />)

    const panel = container.querySelector('[style*="width"]')
    expect(panel).toHaveStyle({ width: '100%' })
  })
})
