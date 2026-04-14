import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ExecutionDetailsPanel, type WorkflowDefShape } from './ExecutionDetailsPanel'

const WORKFLOW_DEF = {
  triggers: [{ type: 'manual' }],
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

    it('spans full width', () => {
      const { container } = renderPanel(WORKFLOW_DEF)

      expect(container.querySelector('[style*="width"]')).toHaveStyle({ width: '100%' })
    })
  })

  describe('table rows', () => {
    it('renders trigger, then activity names from workflow definition', () => {
      renderPanel(WORKFLOW_DEF)

      expect(screen.getByText('Manual')).toBeInTheDocument()
      expect(screen.getByText('Process data')).toBeInTheDocument()
      expect(screen.getByText('Send notification')).toBeInTheDocument()
    })

    it('renders a status label per trigger and activity (3 total)', () => {
      renderPanel(WORKFLOW_DEF)

      const labels = screen.getAllByTestId('activity-status-label')
      expect(labels).toHaveLength(3)
      expect(labels[0]).toHaveTextContent('completed')
      expect(labels[1]).toHaveTextContent('completed')
      expect(labels[2]).toHaveTextContent('running')
    })
  })

  describe('fallback behavior', () => {
    it('uses activity ID when no workflow definition is provided', () => {
      renderPanel()

      expect(screen.getByText('task-1')).toBeInTheDocument()
      expect(screen.getByText('task-2')).toBeInTheDocument()
    })
  })
})
