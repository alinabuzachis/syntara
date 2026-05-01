import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { ExecutionDetailsPanel, type WorkflowDefShape } from './ExecutionDetailsPanel'

/** v1 workflow definition: names live under workflow.activities */
const WORKFLOW_DEF: WorkflowDefShape = {
  workflow: {
    activities: [
      { id: 'task-1', name: 'Process data' },
      { id: 'task-2', name: 'Send notification' },
    ],
  },
}

/** v2 workflow definition: names live under top-level nodes[] */
const WORKFLOW_DEF_V2: WorkflowDefShape = {
  nodes: [
    { id: 'task-1', name: 'My AI Agent' },
    { id: 'task-2', name: 'Data Processor' },
  ],
}

/** Mixed definition: both nodes (v2) and workflow.activities (v1) present */
const WORKFLOW_DEF_MIXED: WorkflowDefShape = {
  nodes: [
    { id: 'task-1', name: 'V2 Agent Name' },
    { id: 'task-2', name: 'V2 Processor Name' },
  ],
  workflow: {
    activities: [
      { id: 'task-1', name: 'V1 Process data' },
      { id: 'task-2', name: 'V1 Send notification' },
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

function renderPanelWithClose(onClosePanel: () => void, headerLabel?: string) {
  return render(
    <ExecutionDetailsPanel
      executionId="exec-123"
      workflowDefinition={WORKFLOW_DEF}
      headerLabel={headerLabel}
      onClosePanel={onClosePanel}
    />
  )
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

  describe('v2 workflow definition (nodes[])', () => {
    it('shows activity names from v2 nodes array', () => {
      renderPanel(WORKFLOW_DEF_V2)

      expect(screen.getByText('My AI Agent')).toBeInTheDocument()
      expect(screen.getByText('Data Processor')).toBeInTheDocument()
    })

    it('does not fall back to activity IDs when v2 nodes provide names', () => {
      renderPanel(WORKFLOW_DEF_V2)

      expect(screen.queryByText('task-1')).not.toBeInTheDocument()
      expect(screen.queryByText('task-2')).not.toBeInTheDocument()
    })
  })

  describe('v2 nodes takes precedence over v1 workflow.activities', () => {
    it('uses v2 node names when both nodes and workflow.activities are present', () => {
      renderPanel(WORKFLOW_DEF_MIXED)

      expect(screen.getByText('V2 Agent Name')).toBeInTheDocument()
      expect(screen.getByText('V2 Processor Name')).toBeInTheDocument()

      expect(screen.queryByText('V1 Process data')).not.toBeInTheDocument()
      expect(screen.queryByText('V1 Send notification')).not.toBeInTheDocument()
    })
  })

  describe('fallback behavior', () => {
    it('uses activity ID when no workflow definition is provided', () => {
      renderPanel()

      expect(screen.getByText('task-1')).toBeInTheDocument()
      expect(screen.getByText('task-2')).toBeInTheDocument()
    })

    it('uses activity ID when workflow definition is null', () => {
      renderPanel(null)

      expect(screen.getByText('task-1')).toBeInTheDocument()
      expect(screen.getByText('task-2')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderPanel(WORKFLOW_DEF)

      // Exclude aria-valid-attr-value: PF6 Tabs renders aria-controls pointing to
      // tab panels that are not in the DOM (only the active panel is rendered).
      const results = await axe(container, { rules: { 'aria-valid-attr-value': { enabled: false } } })
      expect(results).toHaveNoViolations()
    })
  })

  describe('headerLabel and close button', () => {
    it('renders default title when headerLabel is not provided', () => {
      renderPanel(WORKFLOW_DEF)

      expect(screen.getByText('Current run details')).toBeInTheDocument()
    })

    it('renders custom headerLabel when provided', () => {
      renderPanelWithClose(vi.fn(), 'Most recent run details')

      expect(screen.getByText('Most recent run details')).toBeInTheDocument()
      expect(screen.queryByText('Current run details')).not.toBeInTheDocument()
    })

    it('does not render a close button when onClosePanel is not provided', () => {
      renderPanel(WORKFLOW_DEF)

      expect(screen.queryByRole('button', { name: 'Close run details panel' })).not.toBeInTheDocument()
    })

    it('renders a close button when onClosePanel is provided', () => {
      renderPanelWithClose(vi.fn())

      expect(screen.getByRole('button', { name: 'Close run details panel' })).toBeInTheDocument()
    })

    it('calls onClosePanel when the close button is clicked', async () => {
      const user = userEvent.setup()
      const onClosePanel = vi.fn()
      renderPanelWithClose(onClosePanel)

      await user.click(screen.getByRole('button', { name: 'Close run details panel' }))

      expect(onClosePanel).toHaveBeenCalledTimes(1)
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

  describe('accessibility', () => {
    // PatternFly Tabs generates aria-controls with random IDs that don't match
    // rendered panel IDs in jsdom — a known upstream issue, not an application bug.
    const axeTabRules = { rules: { 'aria-valid-attr-value': { enabled: false } } }

    it('has no violations in default state', async () => {
      const { container } = renderPanel(WORKFLOW_DEF)
      expect(await axe(container, axeTabRules)).toHaveNoViolations()
    })

    it('has no violations with close button', async () => {
      const { container } = renderPanelWithClose(vi.fn(), 'Most recent run details')
      expect(await axe(container, axeTabRules)).toHaveNoViolations()
    })
  })
})
