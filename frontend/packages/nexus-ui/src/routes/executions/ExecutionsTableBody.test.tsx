import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { FlatExecutionsTableBody } from './ExecutionsTableBody'

vi.mock('../../hooks/routing/useLocation', () => ({
  useLocation: vi.fn(() => '/executions'),
}))
vi.mock('../../hooks/routing/useNavigate', () => ({
  useNavigate: vi.fn(() => vi.fn()),
}))
vi.mock('../../components/WorkflowName', () => ({
  WorkflowName: ({ workflowId }: { workflowId: string }) => <span>{workflowId}</span>,
}))
vi.mock('../../components/table/LinkCell', () => ({
  LinkCell: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

function renderTable(executions: Parameters<typeof FlatExecutionsTableBody>[0]['executions']) {
  return render(
    <table>
      <FlatExecutionsTableBody executions={executions} />
    </table>
  )
}

describe('ExecutionsTableBody - Pending Approval Badge', () => {
  it('shows "Pending approval" badge when approval_pending is true', () => {
    renderTable([
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        status: 'paused',
        approval_pending: true,
        completed_at: null,
      },
    ])

    expect(screen.getByText('Pending approval')).toBeInTheDocument()
  })

  it('does not show "Pending approval" badge when approval_pending is false', () => {
    renderTable([
      {
        id: 'exec-2',
        workflow_id: 'wf-1',
        status: 'paused',
        approval_pending: false,
        completed_at: null,
      },
    ])

    expect(screen.queryByText('Pending approval')).not.toBeInTheDocument()
  })

  it('does not show "Pending approval" badge when approval_pending is undefined', () => {
    renderTable([
      {
        id: 'exec-3',
        workflow_id: 'wf-1',
        status: 'running',
        completed_at: null,
      },
    ])

    expect(screen.queryByText('Pending approval')).not.toBeInTheDocument()
  })

  it('shows badge alongside Running status for parallel branch case', () => {
    renderTable([
      {
        id: 'exec-4',
        workflow_id: 'wf-1',
        status: 'running',
        approval_pending: true,
        completed_at: null,
      },
    ])

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Pending approval')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderTable([
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        status: 'running',
        approval_pending: true,
        completed_at: null,
      },
    ])

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
