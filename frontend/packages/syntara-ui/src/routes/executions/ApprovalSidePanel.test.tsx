import type { Approval } from '@syntara/contracts'
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
  project_id: 'project-1',
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
  it('renders the panel header with "Review approval" title', () => {
    render(<ApprovalSidePanel approval={mockApproval} onClose={vi.fn()} onDecisionSubmitted={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Review approval' })).toBeInTheDocument()
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

  it('remounts ApprovalDetailContent when approval changes', () => {
    const { rerender } = render(
      <ApprovalSidePanel approval={mockApproval} onClose={vi.fn()} onDecisionSubmitted={vi.fn()} />
    )

    expect(screen.getByText('Approval: Test Approval')).toBeInTheDocument()

    const newApproval: Approval = {
      ...mockApproval,
      id: 'approval-2',
      name: 'Second Approval',
    }

    rerender(<ApprovalSidePanel approval={newApproval} onClose={vi.fn()} onDecisionSubmitted={vi.fn()} />)

    // Component should remount with new approval due to key={approval.id}
    expect(screen.getByText('Approval: Second Approval')).toBeInTheDocument()
  })

  describe('Multi-approval navigation', () => {
    it('shows ApprovalNavigationHeader when multiple approvals exist', () => {
      render(
        <ApprovalSidePanel
          approval={mockApproval}
          onClose={vi.fn()}
          onDecisionSubmitted={vi.fn()}
          currentIndex={0}
          totalCount={3}
          hasPrev={false}
          hasNext={true}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
        />
      )

      // Navigation header shows count (with parentheses)
      expect(screen.getByText(/\(1 of 3\)/)).toBeInTheDocument()
      // Should have navigation buttons
      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
    })

    it('shows SidePanelHeader when only one approval exists', () => {
      render(
        <ApprovalSidePanel approval={mockApproval} onClose={vi.fn()} onDecisionSubmitted={vi.fn()} totalCount={1} />
      )

      // Should not show navigation controls
      expect(screen.queryByText(/of/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
    })

    it('calls onNavigatePrev when previous button is clicked', async () => {
      const user = userEvent.setup()
      const onNavigatePrev = vi.fn()

      render(
        <ApprovalSidePanel
          approval={mockApproval}
          onClose={vi.fn()}
          onDecisionSubmitted={vi.fn()}
          currentIndex={1}
          totalCount={3}
          hasPrev={true}
          hasNext={true}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={vi.fn()}
        />
      )

      await user.click(screen.getByRole('button', { name: /previous/i }))
      expect(onNavigatePrev).toHaveBeenCalledOnce()
    })

    it('calls onNavigateNext when next button is clicked', async () => {
      const user = userEvent.setup()
      const onNavigateNext = vi.fn()

      render(
        <ApprovalSidePanel
          approval={mockApproval}
          onClose={vi.fn()}
          onDecisionSubmitted={vi.fn()}
          currentIndex={0}
          totalCount={3}
          hasPrev={false}
          hasNext={true}
          onNavigatePrev={vi.fn()}
          onNavigateNext={onNavigateNext}
        />
      )

      await user.click(screen.getByRole('button', { name: /next/i }))
      expect(onNavigateNext).toHaveBeenCalledOnce()
    })

    it('shows SidePanelHeader when totalCount is undefined', () => {
      render(
        <ApprovalSidePanel
          approval={mockApproval}
          onClose={vi.fn()}
          onDecisionSubmitted={vi.fn()}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
        />
      )

      // Should not show navigation controls when totalCount is undefined
      expect(screen.queryByText(/of/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
    })

    it('shows SidePanelHeader when navigation handlers are missing', () => {
      render(
        <ApprovalSidePanel
          approval={mockApproval}
          onClose={vi.fn()}
          onDecisionSubmitted={vi.fn()}
          currentIndex={0}
          totalCount={3}
          hasPrev={false}
          hasNext={true}
        />
      )

      // Should not show navigation controls when handlers are missing
      expect(screen.queryByText(/of/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
    })

    it('passes activityNameMap to ApprovalDetailContent', () => {
      const activityNameMap = new Map([['node-1', 'Custom Node Name']])

      render(
        <ApprovalSidePanel
          approval={mockApproval}
          onClose={vi.fn()}
          onDecisionSubmitted={vi.fn()}
          activityNameMap={activityNameMap}
        />
      )

      expect(screen.getByTestId('approval-detail-content')).toBeInTheDocument()
    })

    it('has no accessibility violations with navigation controls', async () => {
      const { container } = render(
        <ApprovalSidePanel
          approval={mockApproval}
          onClose={vi.fn()}
          onDecisionSubmitted={vi.fn()}
          currentIndex={1}
          totalCount={3}
          hasPrev={true}
          hasNext={true}
          onNavigatePrev={vi.fn()}
          onNavigateNext={vi.fn()}
        />
      )

      expect(await axe(container)).toHaveNoViolations()
    })

    it('shows ApprovalNavigationHeader when onNavigatePrev is missing but other props present', () => {
      render(
        <ApprovalSidePanel
          approval={mockApproval}
          onClose={vi.fn()}
          onDecisionSubmitted={vi.fn()}
          currentIndex={1}
          totalCount={3}
          onNavigateNext={vi.fn()}
          // onNavigatePrev is missing
        />
      )

      // Should fall back to SidePanelHeader (no navigation)
      expect(screen.queryByText(/of/)).not.toBeInTheDocument()
    })

    it('shows ApprovalNavigationHeader when onNavigateNext is missing but other props present', () => {
      render(
        <ApprovalSidePanel
          approval={mockApproval}
          onClose={vi.fn()}
          onDecisionSubmitted={vi.fn()}
          currentIndex={1}
          totalCount={3}
          onNavigatePrev={vi.fn()}
          // onNavigateNext is missing
        />
      )

      // Should fall back to SidePanelHeader (no navigation)
      expect(screen.queryByText(/of/)).not.toBeInTheDocument()
    })
  })
})
