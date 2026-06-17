import type { Approval } from '@ansible/nexus-contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { approvalsClient } from '../../../client'

import { ApprovalReviewModal } from './ApprovalReviewModal'

vi.mock('../../../client', () => ({
  approvalsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  usersClient: {
    useQuery: vi.fn(() => ({
      data: undefined,
      isLoading: false,
    })),
  },
}))

vi.mock('../../../stores/useAuthStore', () => ({
  useAuthStore: vi.fn((selector: (state: { username: string; userId: string }) => unknown) => {
    const state = { username: 'testuser', userId: 'test-user-id' }

    return selector(state)
  }),
}))

vi.mock('../../approvals/useCanDecideApproval', () => ({
  useCanDecideApproval: vi.fn(() => ({
    canDecide: true,
    isLoading: false,
  })),
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
  beforeEach(() => {
    vi.mocked(approvalsClient.useQuery).mockReturnValue({ data: undefined, refetch: vi.fn() })
    vi.mocked(approvalsClient.useMutation).mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

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

    // The modal has multiple "Close" buttons: the X button (plain) and the link button in content
    // Click either one - use getAllByRole and click the first match (the X button)
    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    await user.click(closeButtons[0])
    expect(onClose).toHaveBeenCalled()
  })
})
