import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { SimpleList } from '@patternfly/react-core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AutomationHistoryCard, ExecutionHistoryRow } from './AutomationHistoryCard'

type Execution = ExecutionsAPI.components['schemas']['Execution']

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
  status: 'running',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
}

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

  it('renders the subtext', () => {
    render(<AutomationHistoryCard {...defaultProps} />)
    expect(screen.getByText('View past runs of this automation.')).toBeInTheDocument()
  })

  it('renders close button', () => {
    render(<AutomationHistoryCard {...defaultProps} />)
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<AutomationHistoryCard {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows empty message when no executions', () => {
    render(<AutomationHistoryCard {...defaultProps} />)
    expect(screen.getByText('No execution history available')).toBeInTheDocument()
  })

  it('renders date group header "Today" for a recent execution', () => {
    render(<AutomationHistoryCard {...defaultProps} executions={[baseExecution]} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('renders execution rows with formatted date and status', () => {
    render(<AutomationHistoryCard {...defaultProps} executions={[baseExecution]} />)
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
    expect(screen.getByTestId('status-label')).toHaveTextContent('running')
  })

  it('renders truncated run ID with label', () => {
    render(<AutomationHistoryCard {...defaultProps} executions={[baseExecution]} />)
    expect(screen.getByText('Run ID: 12345678')).toBeInTheDocument()
  })

  it('renders elapsed time when started_at and completed_at are present', () => {
    const execution: Execution = {
      ...baseExecution,
      started_at: '2024-01-15T10:00:00Z',
      completed_at: '2024-01-15T10:01:30Z',
    }
    render(<AutomationHistoryCard {...defaultProps} executions={[execution]} />)
    expect(screen.getByText('Elapsed time: 90000ms')).toBeInTheDocument()
  })

  it('renders "Elapsed time: -" when execution is completed with no timing data', () => {
    const execution: Execution = { ...baseExecution, status: 'completed' }
    render(<AutomationHistoryCard {...defaultProps} executions={[execution]} />)
    expect(screen.getByText('Elapsed time: -')).toBeInTheDocument()
  })

  it('renders multiple execution rows', () => {
    const executions: Execution[] = [
      { ...baseExecution, id: 'aaaaaaaa-0000-0000-0000-000000000001', status: 'completed' },
      { ...baseExecution, id: 'bbbbbbbb-0000-0000-0000-000000000002', status: 'failed' },
    ]
    render(<AutomationHistoryCard {...defaultProps} executions={executions} />)
    const statusLabels = screen.getAllByTestId('status-label')
    expect(statusLabels).toHaveLength(2)
    expect(statusLabels[0]).toHaveTextContent('completed')
    expect(statusLabels[1]).toHaveTextContent('failed')
  })

  it('calls onExecutionSelect with the execution id when row is clicked', () => {
    render(<AutomationHistoryCard {...defaultProps} executions={[baseExecution]} />)
    const row = screen.getByRole('button', { name: /running/i })
    fireEvent.click(row)
    expect(mockOnExecutionSelect).toHaveBeenCalledWith(baseExecution.id)
  })

  it('highlights the selected execution row with pf-m-current class', () => {
    render(
      <AutomationHistoryCard {...defaultProps} executions={[baseExecution]} selectedExecutionId={baseExecution.id} />
    )
    const buttons = screen.getAllByRole('button')
    const rowButton = buttons.find((btn) => btn.textContent?.includes('Jan 15, 2024'))!
    expect(rowButton).toHaveClass('pf-m-current')
  })

  it('does not highlight an unselected row', () => {
    render(<AutomationHistoryCard {...defaultProps} executions={[baseExecution]} selectedExecutionId="other-id" />)
    const rowButton = screen.getByRole('button', { name: /running/i })
    expect(rowButton).not.toHaveClass('pf-m-current')
  })

  it('renders a SimpleList when executions are present', () => {
    render(<AutomationHistoryCard {...defaultProps} executions={[baseExecution]} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
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

  it('renders elapsed time label when started_at and completed_at are present', () => {
    const execution: Execution = {
      ...baseExecution,
      started_at: '2024-01-15T10:00:00Z',
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
    const { getByText } = within(row)
    expect(getByText(/Jan 15, 2024/)).toBeInTheDocument()
    expect(getByText('Run ID: 12345678')).toBeInTheDocument()
  })
})
