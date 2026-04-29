import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ExecutionDetailsPanel, type WorkflowDefShape } from './ExecutionDetailsPanel'

const WORKFLOW_DEF = {
  workflow: {
    activities: [
      { id: 'task-1', name: 'Process data', type: 'task' },
      { id: 'task-2', name: 'Send notification', type: 'task' },
    ],
  },
}

const EXECUTION = {
  data: {
    id: 'exec-123',
    workflow_id: 'wf-123',
    status: 'running',
    started_at: '2024-01-01T00:00:00Z',
    activities: [
      {
        activity_id: 'task-1',
        status: 'completed',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
      },
      { activity_id: 'task-2', status: 'running', started_at: '2024-01-01T00:01:00Z' },
    ],
  },
  isLoading: false,
  error: null,
}

vi.mock('../../client', () => ({
  executionsClient: { useQuery: vi.fn(() => EXECUTION) },
}))

vi.mock('./ExecutionStatus', () => ({
  StatusLabel: ({ status }: { status: string }) => <div data-testid="status-label">{status}</div>,
  ActivityStatusLabel: ({ status }: { status: string }) => <div data-testid="activity-status-label">{status}</div>,
}))

function renderPanel(workflowDefinition?: WorkflowDefShape | null) {
  return render(<ExecutionDetailsPanel executionId="exec-123" workflowDefinition={workflowDefinition} />)
}

describe('ExecutionDetailsPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('header', () => {
    it('renders title and execution status', () => {
      renderPanel(WORKFLOW_DEF)

      expect(screen.getByText('Current run details')).toBeInTheDocument()
      expect(screen.getByTestId('status-label')).toHaveTextContent('running')
    })

    it('shows elapsed time that ticks while running', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T00:00:30Z'))

      renderPanel(WORKFLOW_DEF)
      expect(screen.getByText(/Elapsed time: 30s/)).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(screen.getByText(/Elapsed time: 32s/)).toBeInTheDocument()

      vi.useRealTimers()
    })
  })

  describe('table rows', () => {
    it('renders activity names from workflow definition', () => {
      renderPanel(WORKFLOW_DEF)

      expect(screen.getByText('Process data')).toBeInTheDocument()
      expect(screen.getByText('Send notification')).toBeInTheDocument()
    })

    it('renders a status label per activity', () => {
      renderPanel(WORKFLOW_DEF)

      const labels = screen.getAllByTestId('activity-status-label')
      expect(labels).toHaveLength(2)
      expect(labels[0]).toHaveTextContent('completed')
      expect(labels[1]).toHaveTextContent('running')
    })
  })

  describe('fallback behavior', () => {
    it('uses activity ID when no workflow definition is provided', () => {
      renderPanel()

      expect(screen.getByText('task-1')).toBeInTheDocument()
      expect(screen.getByText('task-2')).toBeInTheDocument()
    })
  })

  describe('view mode toggle', () => {
    it('renders Overview and Details tabs', () => {
      renderPanel(WORKFLOW_DEF)

      expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    })

    it('defaults to Overview mode with activity table visible', () => {
      renderPanel(WORKFLOW_DEF)

      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByText('Process data')).toBeInTheDocument()
    })

    it('switches to Details mode showing no-selection state', async () => {
      const user = userEvent.setup()
      renderPanel(WORKFLOW_DEF)

      await user.click(screen.getByRole('tab', { name: 'Details' }))

      expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText(/Select a step/)).toBeInTheDocument()
    })

    it('switches back to Overview mode', async () => {
      const user = userEvent.setup()
      renderPanel(WORKFLOW_DEF)

      await user.click(screen.getByRole('tab', { name: 'Details' }))
      await user.click(screen.getByRole('tab', { name: 'Overview' }))

      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('Process data')).toBeInTheDocument()
    })
  })
})
