import type { Approval } from '@ansible/nexus-contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ApprovalReviewModal } from './ApprovalReviewModal'

vi.mock('../../../client', () => ({
  approvalsClient: {
    useQuery: vi.fn().mockReturnValue({ data: undefined, refetch: vi.fn() }),
    useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  },
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

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

describe('ApprovalReviewModal', () => {
  it('does not render when isOpen is false', () => {
    render(<ApprovalReviewModal approval={mockApproval} isOpen={false} onClose={vi.fn()} />, { wrapper })

    expect(screen.queryByText('Review approval')).not.toBeInTheDocument()
  })

  it('does not render when approval is null', () => {
    render(<ApprovalReviewModal approval={null} isOpen={true} onClose={vi.fn()} />, { wrapper })

    expect(screen.queryByText('Review approval')).not.toBeInTheDocument()
  })

  it('renders the modal with approval content when open with approval', () => {
    render(<ApprovalReviewModal approval={mockApproval} isOpen={true} onClose={vi.fn()} />, { wrapper })

    expect(screen.getByText('Review approval')).toBeInTheDocument()
    expect(screen.getByText('Submit decision')).toBeInTheDocument()
  })

  it('has no accessibility violations when open', async () => {
    const { container } = render(<ApprovalReviewModal approval={mockApproval} isOpen={true} onClose={vi.fn()} />, {
      wrapper,
    })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('calls onClose when the modal close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ApprovalReviewModal approval={mockApproval} isOpen={true} onClose={onClose} />, { wrapper })

    const closeButton = screen.getByRole('button', { name: 'Close' })
    await user.click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })
})
