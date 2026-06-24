import type { Approval } from '@ansible/nexus-contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { approvalsClient } from '../../client'

import { ApprovalDetailContent } from './ApprovalDetailContent'

vi.mock('../../client', () => ({
  approvalsClient: {
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
    })),
  },
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../../providers/alerts', () => ({
  useAlerts: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('../../components/details/NxCodeBlock', () => ({
  NxCodeBlock: ({ jsonObject }: { jsonObject: unknown }) => (
    <pre data-testid="code-block">{JSON.stringify(jsonObject, null, 2)}</pre>
  ),
}))

vi.mock('../access/accessClient', () => ({
  accessFetchClient: { POST: vi.fn(() => Promise.resolve({ data: { allowed: true } })) },
  accessClient: {
    useQuery: vi.fn(() => ({
      data: { permissions: [] },
      isLoading: false,
      error: null,
    })),
  },
}))

// Mock useApprovalDecideProjects to return allowed by default
vi.mock('./useApprovalDecideProjects', () => ({
  useApprovalDecideProjects: vi.fn(() => ({
    canDecideAllProjects: true, // Default: user can decide on all projects
    canDecideProjectNames: new Set<string>(),
    isLoading: false,
    error: null,
  })),
}))

// Mock useProjectSelector to return empty projects list
vi.mock('../../hooks/useProjectSelector', () => ({
  useProjectSelector: vi.fn(() => ({
    projects: [],
    isLoading: false,
  })),
}))

// Mock useCanDecideApproval to return allowed by default
const mockCanDecide = vi.fn(() => true)
vi.mock('./useCanDecideApproval', () => ({
  useCanDecideApproval: vi.fn(() => ({
    canDecide: mockCanDecide(),
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

describe('ApprovalDetailContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(approvalsClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
    } as never)
  })

  it('renders the approval summary with workflow name', () => {
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    expect(screen.getByText('Test Workflow')).toBeInTheDocument()
  })

  it('renders Approve and Reject buttons for pending approval', () => {
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('does not render Approve/Reject buttons for completed approval', () => {
    const approvedApproval = { ...mockApproval, status: 'approved' as const }
    render(<ApprovalDetailContent approval={approvedApproval} />, { wrapper })

    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('shows notes input after clicking Approve', async () => {
    const user = userEvent.setup()
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Approve' }))

    expect(screen.getByRole('textbox', { name: 'Approval notes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit decision' })).toBeInTheDocument()
  })

  it('shows notes input after clicking Reject', async () => {
    const user = userEvent.setup()
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Reject' }))

    expect(screen.getByRole('textbox', { name: 'Rejection notes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit decision' })).toBeInTheDocument()
  })

  it('allows undoing a decision selection', async () => {
    const user = userEvent.setup()
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByRole('textbox', { name: 'Approval notes' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo decision' }))
    expect(screen.queryByRole('textbox', { name: 'Approval notes' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('renders status badge for approved approval', () => {
    const approvedApproval = { ...mockApproval, status: 'approved' as const }
    render(<ApprovalDetailContent approval={approvedApproval} />, { wrapper })

    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('renders status badge for rejected approval', () => {
    const rejectedApproval = { ...mockApproval, status: 'rejected' as const }
    render(<ApprovalDetailContent approval={rejectedApproval} />, { wrapper })

    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('shows decision notes when approval has been decided', () => {
    const decidedApproval = {
      ...mockApproval,
      status: 'approved' as const,
      decision_notes: 'Looks good, approved.',
    }
    render(<ApprovalDetailContent approval={decidedApproval} />, { wrapper })

    expect(screen.getByText('Looks good, approved.')).toBeInTheDocument()
    expect(screen.getByText('Approval notes')).toBeInTheDocument()
  })

  it('renders approval step name in the summary', () => {
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    expect(screen.getByText('Approval step')).toBeInTheDocument()
    expect(screen.getByText('Test Approval')).toBeInTheDocument()
  })

  it('renders approval initiated date in the summary', () => {
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    expect(screen.getByText('Approval initiated')).toBeInTheDocument()
  })

  it('renders message when description is present', () => {
    const withDescription = { ...mockApproval, description: 'Review this deployment' } as Approval
    render(<ApprovalDetailContent approval={withDescription} />, { wrapper })

    expect(screen.getByText('Message')).toBeInTheDocument()
    expect(screen.getByText('Review this deployment')).toBeInTheDocument()
  })

  it('does not render message when no description or prompt', () => {
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    expect(screen.queryByText('Message')).not.toBeInTheDocument()
  })

  it('renders code block with approval data', () => {
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    expect(screen.getByTestId('code-block')).toBeInTheDocument()
  })

  it('has no accessibility violations in pending state', async () => {
    const { container } = render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('calls mutate when submitting a decision', async () => {
    const mutate = vi.fn()
    vi.mocked(approvalsClient.useMutation).mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: false,
    } as never)

    const user = userEvent.setup()
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Submit decision' }))

    expect(mutate).toHaveBeenCalledOnce()
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { path: { approval_id: 'approval-1' } },
        body: { status: 'approved', notes: null },
      }),
      expect.objectContaining({
        onSuccess: expect.any(Function) as unknown,
        onError: expect.any(Function) as unknown,
      })
    )
  })

  it('includes notes in the mutation when provided', async () => {
    const mutate = vi.fn()
    vi.mocked(approvalsClient.useMutation).mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: false,
    } as never)

    const user = userEvent.setup()
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Reject' }))
    await user.type(screen.getByRole('textbox', { name: 'Rejection notes' }), 'Not ready yet')
    await user.click(screen.getByRole('button', { name: 'Submit decision' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { status: 'rejected', notes: 'Not ready yet' },
      }),
      expect.anything()
    )
  })

  it('calls onDecisionSubmitted on successful mutation', async () => {
    const mutate = vi.fn((_args: unknown, options: { onSuccess: () => void }) => {
      options.onSuccess()
    })
    vi.mocked(approvalsClient.useMutation).mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: false,
    } as never)

    const onDecisionSubmitted = vi.fn()
    const user = userEvent.setup()
    render(<ApprovalDetailContent approval={mockApproval} onDecisionSubmitted={onDecisionSubmitted} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Submit decision' }))

    expect(onDecisionSubmitted).toHaveBeenCalledOnce()
  })

  it('renders workflow name as a link when onWorkflowClick is provided', async () => {
    const onWorkflowClick = vi.fn()
    const user = userEvent.setup()
    render(<ApprovalDetailContent approval={mockApproval} onWorkflowClick={onWorkflowClick} />, { wrapper })

    const workflowLink = screen.getByRole('button', { name: 'Test Workflow' })
    expect(workflowLink).toBeInTheDocument()

    await user.click(workflowLink)
    expect(onWorkflowClick).toHaveBeenCalledWith('/workflow-builder/wfv-1')
  })

  it('renders workflow name as plain text when no onWorkflowClick', () => {
    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    expect(screen.queryByRole('button', { name: 'Test Workflow' })).not.toBeInTheDocument()
    expect(screen.getByText('Test Workflow')).toBeInTheDocument()
  })

  it('disables approve/reject buttons when permission is denied', () => {
    mockCanDecide.mockReturnValue(false)

    render(<ApprovalDetailContent approval={mockApproval} />, { wrapper })

    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('renders message from prop instead of approval description', () => {
    render(<ApprovalDetailContent approval={mockApproval} message="Custom prompt message" />, { wrapper })

    expect(screen.getByText('Custom prompt message')).toBeInTheDocument()
  })

  it('has no accessibility violations in approved state', async () => {
    const approvedApproval = { ...mockApproval, status: 'approved' as const }
    const { container } = render(<ApprovalDetailContent approval={approvedApproval} />, { wrapper })

    expect(await axe(container)).toHaveNoViolations()
  })
})
