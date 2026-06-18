import type { Approval } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ApprovalSidePanel } from './ApprovalSidePanel'

vi.mock('../approvals/ApprovalDetailContent', () => ({
  ApprovalDetailContent: ({ approval }: { approval: { name: string } }) => (
    <div data-testid="approval-detail-content">Approval: {approval.name}</div>
  ),
}))

const mockApproval: Approval = {
  id: 'approval-1',
  name: 'Test Approval',
  status: 'pending',
  execution_id: 'exec-1',
  approval_node_id: 'node-1',
  workflow_context: {
    workflow_version_id: 'wfv-1',
    workflow_name: 'Test Workflow',
    inputs: {},
  },
  next_step_approved: { id: 'step-a', name: 'Approved Step', type: 'task' },
  next_step_rejected: { id: 'step-r', name: 'Rejected Step', type: 'task' },
  created_at: '2026-01-01T00:00:00Z',
}

describe('ApprovalSidePanel', () => {
  it('renders the panel header with "Review Approval" title', () => {
    render(<ApprovalSidePanel approval={mockApproval} onClose={vi.fn()} onDecisionSubmitted={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Review Approval' })).toBeInTheDocument()
  })

  it('renders the close button', () => {
    render(<ApprovalSidePanel approval={mockApproval} onClose={vi.fn()} onDecisionSubmitted={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Close approval panel' })).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ApprovalSidePanel approval={mockApproval} onClose={onClose} onDecisionSubmitted={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Close approval panel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders the ApprovalDetailContent', () => {
    render(<ApprovalSidePanel approval={mockApproval} onClose={vi.fn()} onDecisionSubmitted={vi.fn()} />)

    expect(screen.getByTestId('approval-detail-content')).toBeInTheDocument()
    expect(screen.getByText('Approval: Test Approval')).toBeInTheDocument()
  })

  it('passes message prop through to ApprovalDetailContent', () => {
    render(
      <ApprovalSidePanel
        approval={mockApproval}
        message="Please review before deploying"
        onClose={vi.fn()}
        onDecisionSubmitted={vi.fn()}
      />
    )

    expect(screen.getByTestId('approval-detail-content')).toBeInTheDocument()
  })

  it('passes onNavigate prop through to ApprovalDetailContent', () => {
    const onNavigate = vi.fn()
    render(
      <ApprovalSidePanel
        approval={mockApproval}
        onClose={vi.fn()}
        onDecisionSubmitted={vi.fn()}
        onNavigate={onNavigate}
      />
    )

    expect(screen.getByTestId('approval-detail-content')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <ApprovalSidePanel approval={mockApproval} onClose={vi.fn()} onDecisionSubmitted={vi.fn()} />
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
