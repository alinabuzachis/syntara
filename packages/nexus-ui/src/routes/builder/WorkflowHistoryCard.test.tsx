import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { SimpleList } from '@patternfly/react-core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkflowHistoryCard, ExecutionHistoryRow } from './WorkflowHistoryCard'

type Execution = ExecutionsAPI.components['schemas']['ExecutionRead']

vi.mock('./ExecutionStatus', () => ({
  StatusLabel: ({ status }: { status: string }) => <span data-testid="status-label">{status}</span>,
}))

vi.mock('../../utils/dateUtils', () => ({
  formatElapsedTime: (ms: number) => `${ms}ms`,
}))

vi.mock('date-fns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('date-fns')>()
  return {
    ...actual,
    isToday: () => true,
    isYesterday: () => false,
  }
})

const baseExecution: Execution = {
  id: '12345678-abcd-ef01-2345-678901234567',
  workflow_id: 'wf-1',
  workflow_version_id: 'wfv-1',
  temporal_workflow_id: 'temporal-wf-1',
  status: 'running',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  created_by: 'user-1',
  updated_by: null,
  completed_at: null,
  input_data: {},
  error_details: null,
}

describe('WorkflowHistoryCard', () => {
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
    render(<WorkflowHistoryCard {...defaultProps} />)
    expect(screen.getByText('Run History')).toBeInTheDocument()
  })

  it('renders the subtext', () => {
    render(<WorkflowHistoryCard {...defaultProps} />)
    expect(screen.getByText('View past runs of this workflow.')).toBeInTheDocument()
  })

  it('renders close button', () => {
    render(<WorkflowHistoryCard {...defaultProps} />)
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<WorkflowHistoryCard {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows empty message when no executions', () => {
    render(<WorkflowHistoryCard {...defaultProps} />)
    expect(screen.getByText('No execution history available')).toBeInTheDocument()
  })

  it('renders date group header "Today" for a recent execution', () => {
    render(<WorkflowHistoryCard {...defaultProps} executions={[baseExecution]} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('renders execution rows with formatted date and status', () => {
    render(<WorkflowHistoryCard {...defaultProps} executions={[baseExecution]} />)
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
    expect(screen.getByTestId('status-label')).toHaveTextContent('running')
  })

  it('renders truncated run ID with label', () => {
    render(<WorkflowHistoryCard {...defaultProps} executions={[baseExecution]} />)
    expect(screen.getByText('Run ID: 12345678')).toBeInTheDocument()
  })

  it('renders elapsed time when created_at and completed_at are present', () => {
    const execution: Execution = {
      ...baseExecution,
      created_at: '2024-01-15T10:00:00Z',
      completed_at: '2024-01-15T10:01:30Z',
    }
    render(<WorkflowHistoryCard {...defaultProps} executions={[execution]} />)
    expect(screen.getByText('Elapsed time: 90000ms')).toBeInTheDocument()
  })

  it('renders "Elapsed time: -" when execution is completed with no timing data', () => {
    const execution: Execution = { ...baseExecution, status: 'completed' }
    render(<WorkflowHistoryCard {...defaultProps} executions={[execution]} />)
    expect(screen.getByText('Elapsed time: -')).toBeInTheDocument()
  })

  it('renders multiple execution rows', () => {
    const executions: Execution[] = [
      { ...baseExecution, id: 'aaaaaaaa-0000-0000-0000-000000000001', status: 'completed' },
      { ...baseExecution, id: 'bbbbbbbb-0000-0000-0000-000000000002', status: 'failed' },
    ]
    render(<WorkflowHistoryCard {...defaultProps} executions={executions} />)
    const statusLabels = screen.getAllByTestId('status-label')
    expect(statusLabels).toHaveLength(2)
    expect(statusLabels[0]).toHaveTextContent('completed')
    expect(statusLabels[1]).toHaveTextContent('failed')
  })

  it('calls onExecutionSelect with the execution id when row is clicked', () => {
    render(<WorkflowHistoryCard {...defaultProps} executions={[baseExecution]} />)
    const row = screen.getByRole('button', { name: /running/i })
    fireEvent.click(row)
    expect(mockOnExecutionSelect).toHaveBeenCalledWith(baseExecution.id)
  })

  it('highlights the selected execution row with pf-m-current class', () => {
    render(
      <WorkflowHistoryCard {...defaultProps} executions={[baseExecution]} selectedExecutionId={baseExecution.id} />
    )
    const buttons = screen.getAllByRole('button')
    const rowButton = buttons.find((btn) => btn.textContent?.includes('Jan 15, 2024'))!
    expect(rowButton).toHaveClass('pf-m-current')
  })

  it('does not highlight an unselected row', () => {
    render(<WorkflowHistoryCard {...defaultProps} executions={[baseExecution]} selectedExecutionId="other-id" />)
    const rowButton = screen.getByRole('button', { name: /running/i })
    expect(rowButton).not.toHaveClass('pf-m-current')
  })

  it('renders a SimpleList when executions are present', () => {
    render(<WorkflowHistoryCard {...defaultProps} executions={[baseExecution]} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  describe('status filter', () => {
    it('renders filter bar when onFilterChange is provided', () => {
      const onFilterChange = vi.fn()
      render(<WorkflowHistoryCard {...defaultProps} filters={[]} onFilterChange={onFilterChange} />)
      expect(screen.getByText('Filter by status')).toBeInTheDocument()
    })

    it('does not render filter bar when onFilterChange is not provided', () => {
      render(<WorkflowHistoryCard {...defaultProps} />)
      expect(screen.queryByText('Status')).not.toBeInTheDocument()
    })

    it('shows status options from API contract when filter dropdown is opened', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      render(<WorkflowHistoryCard {...defaultProps} filters={[]} onFilterChange={onFilterChange} />)

      // Open the filter value dropdown (second dropdown in attribute-search)
      const statusToggle = screen.getByText('Filter by status')
      await user.click(statusToggle)

      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.getByText('Paused')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Cancelled')).toBeInTheDocument()
    })

    it('calls onFilterChange when a status is selected', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      render(<WorkflowHistoryCard {...defaultProps} filters={[]} onFilterChange={onFilterChange} />)

      const statusToggle = screen.getByText('Filter by status')
      await user.click(statusToggle)
      await user.click(screen.getByText('Completed'))

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ key: 'status', value: 'completed' })])
      )
    })
  })
})

describe('ExecutionHistoryRow', () => {
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderRow(execution: Execution, isSelected?: boolean) {
    return render(
      <SimpleList isControlled={false}>
        <ExecutionHistoryRow execution={execution} onSelect={mockOnSelect} isSelected={isSelected} />
      </SimpleList>
    )
  }

  it('renders formatted date in Mon D, YYYY format for an execution with created_at', () => {
    renderRow(baseExecution)
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
  })

  it('does not render date when created_at is missing', () => {
    const execution = { ...baseExecution, created_at: undefined } as unknown as Execution
    renderRow(execution)
    expect(screen.queryByText(/2024/)).not.toBeInTheDocument()
  })

  it('renders elapsed time label when created_at and completed_at are present', () => {
    const execution: Execution = {
      ...baseExecution,
      created_at: '2024-01-15T10:00:00Z',
      completed_at: '2024-01-15T10:01:30Z',
    }
    renderRow(execution)
    expect(screen.getByText('Elapsed time: 90000ms')).toBeInTheDocument()
  })

  it('renders "Elapsed time: -" when execution is completed with no timing data', () => {
    renderRow({ ...baseExecution, status: 'completed' })
    expect(screen.getByText('Elapsed time: -')).toBeInTheDocument()
  })

  it('renders run ID with label', () => {
    renderRow(baseExecution)
    expect(screen.getByText('Run ID: 12345678')).toBeInTheDocument()
  })

  it('renders status label', () => {
    renderRow(baseExecution)
    expect(screen.getByTestId('status-label')).toHaveTextContent('running')
  })

  it('does not render status label when status is undefined', () => {
    const execution = { ...baseExecution, status: undefined } as unknown as Execution
    renderRow(execution)
    expect(screen.queryByTestId('status-label')).not.toBeInTheDocument()
  })

  it('calls onSelect when row is clicked', () => {
    renderRow(baseExecution)
    fireEvent.click(screen.getByRole('button'))
    expect(mockOnSelect).toHaveBeenCalledTimes(1)
  })

  it('applies pf-m-current class when isSelected is true', () => {
    renderRow(baseExecution, true)
    expect(screen.getByRole('button')).toHaveClass('pf-m-current')
  })

  it('does not apply pf-m-current class when isSelected is false', () => {
    renderRow(baseExecution, false)
    expect(screen.getByRole('button')).not.toHaveClass('pf-m-current')
  })

  it('uses within to check layout structure', () => {
    renderRow(baseExecution)
    const row = screen.getByRole('button')
    expect(within(row).getByText(/Jan 15, 2024/)).toBeInTheDocument()
    expect(within(row).getByText('Run ID: 12345678')).toBeInTheDocument()
  })
})
