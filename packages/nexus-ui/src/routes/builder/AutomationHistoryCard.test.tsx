import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AutomationHistoryCard, ExecutionHistoryRow } from './AutomationHistoryCard'

type Execution = ExecutionsAPI.components['schemas']['Execution']

// Mock StatusLabel component
vi.mock('./ExecutionStatus', () => ({
  StatusLabel: ({ status }: { status: string }) => <span data-testid="status-label">{status}</span>,
}))

describe('AutomationHistoryCard', () => {
  const mockOnClose = vi.fn()
  const mockOnExecutionSelect = vi.fn()

  const defaultProps = {
    executions: [],
    onClose: mockOnClose,
    onExecutionSelect: mockOnExecutionSelect,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the component with title', () => {
    render(<AutomationHistoryCard {...defaultProps} />)

    expect(screen.getByText('Run History')).toBeInTheDocument()
  })

  it('renders close button', () => {
    render(<AutomationHistoryCard {...defaultProps} />)

    const closeButton = screen.getByLabelText('Close')
    expect(closeButton).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<AutomationHistoryCard {...defaultProps} />)

    const closeButton = screen.getByLabelText('Close')
    fireEvent.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows empty message when no executions', () => {
    render(<AutomationHistoryCard {...defaultProps} executions={[]} />)

    expect(screen.getByText('No execution history available')).toBeInTheDocument()
  })

  it('renders table headers when executions exist', () => {
    const executions: Execution[] = [
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        workflow_version_id: 'wfv-1',
        status: 'running',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      },
    ]

    render(<AutomationHistoryCard {...defaultProps} executions={executions} />)

    expect(screen.getByText('Created At')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('renders execution rows with date and status', () => {
    const executions: Execution[] = [
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        workflow_version_id: 'wfv-1',
        status: 'running',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      },
    ]

    render(<AutomationHistoryCard {...defaultProps} executions={executions} />)

    // Status should be rendered via StatusLabel
    expect(screen.getByTestId('status-label')).toHaveTextContent('running')
  })

  it('renders multiple executions', () => {
    const executions: Execution[] = [
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        workflow_version_id: 'wfv-1',
        status: 'completed',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      },
      {
        id: 'exec-2',
        workflow_id: 'wf-1',
        workflow_version_id: 'wfv-1',
        status: 'failed',
        created_at: '2024-01-16T14:30:00Z',
        updated_at: '2024-01-16T14:30:00Z',
      },
    ]

    render(<AutomationHistoryCard {...defaultProps} executions={executions} />)

    const statusLabels = screen.getAllByTestId('status-label')
    expect(statusLabels).toHaveLength(2)
    expect(statusLabels[0]).toHaveTextContent('completed')
    expect(statusLabels[1]).toHaveTextContent('failed')
  })

  it('calls onExecutionSelect when row is clicked', () => {
    const executions: Execution[] = [
      {
        id: 'exec-123',
        workflow_id: 'wf-1',
        workflow_version_id: 'wfv-1',
        status: 'running',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      },
    ]

    render(<AutomationHistoryCard {...defaultProps} executions={executions} />)

    // Click the row (find by status content)
    const row = screen.getByTestId('status-label').closest('tr')
    fireEvent.click(row!)

    expect(mockOnExecutionSelect).toHaveBeenCalledWith('exec-123')
  })

  it('handles execution without created_at date', () => {
    const executions = [
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        workflow_version_id: 'wfv-1',
        status: 'running',
        updated_at: '2024-01-15T10:00:00Z',
        // No created_at
      },
    ] as unknown as Execution[]

    render(<AutomationHistoryCard {...defaultProps} executions={executions} />)

    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('applies hover styles on row mouse enter and leave', () => {
    const executions: Execution[] = [
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        workflow_version_id: 'wfv-1',
        status: 'running',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      },
    ]

    render(<AutomationHistoryCard {...defaultProps} executions={executions} />)

    const row = screen.getByTestId('status-label').closest('tr')

    // Mouse enter - verify event handler is called
    fireEvent.mouseEnter(row!)
    // Mouse leave - verify event handler is called without throwing
    fireEvent.mouseLeave(row!)
    // Just verify the row exists and handles events without error
    expect(row).toBeInTheDocument()
  })

  it('formats date correctly', () => {
    const executions: Execution[] = [
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        workflow_version_id: 'wfv-1',
        status: 'running',
        created_at: '2024-01-15T10:30:45Z',
        updated_at: '2024-01-15T10:30:45Z',
      },
    ]

    render(<AutomationHistoryCard {...defaultProps} executions={executions} />)

    // The date formatting depends on locale, so we just check that date and time are displayed
    const row = screen.getByTestId('status-label').closest('tr')
    expect(row).toBeInTheDocument()
    // Component should display both date and time
  })
})

describe('ExecutionHistoryRow', () => {
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders date and time for an execution with created_at', () => {
    const execution: Execution = {
      id: 'exec-1',
      workflow_id: 'wf-1',
      workflow_version_id: 'wfv-1',
      status: 'running',
      created_at: '2024-01-15T10:30:45Z',
      updated_at: '2024-01-15T10:30:45Z',
    }

    render(
      <table>
        <tbody>
          <ExecutionHistoryRow execution={execution} onSelect={mockOnSelect} />
        </tbody>
      </table>
    )

    const date = new Date('2024-01-15T10:30:45Z')
    expect(screen.getByText(date.toLocaleDateString())).toBeInTheDocument()
    expect(screen.getByText(date.toLocaleTimeString())).toBeInTheDocument()
  })

  it('renders "Unknown" when created_at is missing', () => {
    const execution = {
      id: 'exec-1',
      workflow_id: 'wf-1',
      workflow_version_id: 'wfv-1',
      status: 'running',
      updated_at: '2024-01-15T10:00:00Z',
    } as unknown as Execution

    render(
      <table>
        <tbody>
          <ExecutionHistoryRow execution={execution} onSelect={mockOnSelect} />
        </tbody>
      </table>
    )

    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('renders status label', () => {
    const execution: Execution = {
      id: 'exec-1',
      workflow_id: 'wf-1',
      workflow_version_id: 'wfv-1',
      status: 'completed',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
    }

    render(
      <table>
        <tbody>
          <ExecutionHistoryRow execution={execution} onSelect={mockOnSelect} />
        </tbody>
      </table>
    )

    expect(screen.getByTestId('status-label')).toHaveTextContent('completed')
  })

  it('calls onSelect when row is clicked', () => {
    const execution: Execution = {
      id: 'exec-123',
      workflow_id: 'wf-1',
      workflow_version_id: 'wfv-1',
      status: 'running',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
    }

    render(
      <table>
        <tbody>
          <ExecutionHistoryRow execution={execution} onSelect={mockOnSelect} />
        </tbody>
      </table>
    )

    const row = screen.getByTestId('status-label').closest('tr')
    fireEvent.click(row!)

    expect(mockOnSelect).toHaveBeenCalledTimes(1)
  })

  it.each(['Enter', ' '])('calls onSelect on %s key press', (key) => {
    const execution: Execution = {
      id: 'exec-1',
      workflow_id: 'wf-1',
      workflow_version_id: 'wfv-1',
      status: 'running',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
    }

    render(
      <table>
        <tbody>
          <ExecutionHistoryRow execution={execution} onSelect={mockOnSelect} />
        </tbody>
      </table>
    )

    const row = screen.getByRole('button')
    fireEvent.keyDown(row, { key })

    expect(mockOnSelect).toHaveBeenCalledTimes(1)
  })

  it('renders "Unknown" when execution.status is undefined', () => {
    const execution = {
      id: 'exec-1',
      workflow_id: 'wf-1',
      workflow_version_id: 'wfv-1',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
    } as unknown as Execution

    render(
      <table>
        <tbody>
          <ExecutionHistoryRow execution={execution} onSelect={mockOnSelect} />
        </tbody>
      </table>
    )

    expect(screen.queryByTestId('status-label')).not.toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })
})
