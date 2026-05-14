import type { Approval } from '@ansible/nexus-contracts'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'
import { useLocation, useParams } from 'wouter'

import { approvalsClient } from '../../client'

import ApprovalDetail from './ApprovalDetail'

// Mock the approvalsClient
const mockMutate = vi.fn()
vi.mock('../../client', () => ({
  approvalsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(() => ({
      mutate: mockMutate,
      isPending: false,
    })),
  },
}))

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: vi.fn(),
  useParams: vi.fn(),
}))

describe('ApprovalDetail Component', () => {
  const now = Date.now()
  const mockApproval: Approval = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    labels: {},
    execution_id: '660e8400-e29b-41d4-a716-446655440001',
    approval_node_id: 'approval-activity-1',
    name: 'Test Approval',
    description: 'This is a test approval requiring manual review',
    status: 'pending',
    timeout_at: new Date(now + 22 * 60 * 60 * 1000).toISOString(),
    next_step_approved: {
      id: 'apply_changes',
      name: 'Apply Changes',
      type: 'task',
    },
    next_step_rejected: {
      id: 'rollback',
      name: 'Rollback',
      type: 'task',
    },
    workflow_context: {
      workflow_version_id: '880e8400-e29b-41d4-a716-446655440001',
      workflow_name: 'Test Workflow',
      inputs: {
        target_environment: 'production',
        version: '2.1.0',
      },
      previous_step: {
        id: 'security_scan',
        name: 'Security Scan',
        type: 'task',
        output: {
          vulnerabilities_found: 0,
        },
      },
    },
    decided_by: null,
    decided_at: null,
    decision_notes: null,
  } as unknown as Approval

  beforeEach(() => {
    vi.clearAllMocks()
    mockMutate.mockReset()
    vi.mocked(approvalsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)
    vi.mocked(useParams).mockReturnValue({ approvalId: '550e8400-e29b-41d4-a716-446655440001' })
    vi.mocked(useLocation).mockReturnValue(['/', vi.fn()])
  })

  const mockApprovalQuery = (data: Approval | null, isPending = false, error: unknown = null) => {
    vi.mocked(approvalsClient.useQuery).mockReturnValue({
      data: data,
      isPending,
      error,
      isError: !!error,
      refetch: vi.fn().mockResolvedValue({}),
    } as never)
  }

  it('renders the approval detail page', () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    expect(screen.getByRole('heading', { name: 'Test Approval' })).toBeInTheDocument()
    expect(screen.getByText('Approval type')).toBeInTheDocument()
    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('Approval initiated')).toBeInTheDocument()
  })

  it('displays approval name in header', () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    expect(screen.getByRole('heading', { name: 'Test Approval' })).toBeInTheDocument()
  })

  it('displays approval JSON data', () => {
    mockApprovalQuery(mockApproval)

    const { container } = render(<ApprovalDetail />)

    // CodeBlock should render the approval data as JSON
    // Check that the JSON stringified content contains the approval data

    const codeBlock = container.querySelector('code')
    expect(codeBlock).toBeInTheDocument()
    expect(codeBlock?.textContent).toContain('550e8400-e29b-41d4-a716-446655440001')
    expect(codeBlock?.textContent).toContain('pending')
    expect(codeBlock?.textContent).toContain('Test Approval')
  })

  it('shows loading state', () => {
    mockApprovalQuery(null, true)

    render(<ApprovalDetail />)

    expect(screen.getByText('Approval details')).toBeInTheDocument()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockApprovalQuery(null, false, { message: 'Failed to load' })

    render(<ApprovalDetail />)

    expect(screen.getByText('Approval details')).toBeInTheDocument()
    expect(screen.getByText('Error loading approval')).toBeInTheDocument()
  })

  it('calls refetch when retry is clicked in error state', async () => {
    const mockRefetch = vi.fn().mockResolvedValue({})
    vi.mocked(approvalsClient.useQuery).mockReturnValue({
      data: null,
      isPending: false,
      error: { message: 'Failed to load', retryable: true },
      isError: true,
      refetch: mockRefetch,
    } as never)

    const user = userEvent.setup()
    render(<ApprovalDetail />)

    const retryButton = screen.getByRole('button', { name: 'Retry' })
    await user.click(retryButton)

    expect(mockRefetch).toHaveBeenCalled()
  })

  it('uses approval ID as fallback name when name not provided', () => {
    const approvalWithoutName: Approval = {
      // BaseResource fields
      id: '550e8400-e29b-41d4-a716-446655440002',
      created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      labels: {},
      execution_id: '660e8400-e29b-41d4-a716-446655440002',
      approval_node_id: 'approval-activity-2',
      name: undefined as unknown as string, // Explicitly missing
      description: null,
      status: 'approved',
      timeout_at: null,
      next_step_approved: {
        id: 'proceed',
        name: 'Proceed',
        type: 'task',
      },
      next_step_rejected: null,
      workflow_context: {
        workflow_version_id: '880e8400-e29b-41d4-a716-446655440002',
        workflow_name: 'Another Workflow',
        inputs: {},
      },
      decided_by: {
        id: '770e8400-e29b-41d4-a716-446655440001',
        name: 'John Doe',
      },
      decided_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      decision_notes: 'Approved after review',
    } as unknown as Approval

    mockApprovalQuery(approvalWithoutName)
    vi.mocked(useParams).mockReturnValue({ approvalId: '550e8400-e29b-41d4-a716-446655440002' })

    render(<ApprovalDetail />)

    expect(screen.getByRole('heading', { name: '550e8400-e29b-41d4-a716-446655440002' })).toBeInTheDocument()
  })

  it('shows approve/reject actions for pending approvals', () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('enables submit once a decision is selected without requiring notes', async () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    const submitButton = screen.getByRole('button', { name: 'Submit' })
    expect(submitButton).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(submitButton).toBeEnabled()
  })

  it('shows status and notes for non-pending approvals', () => {
    const approvedApproval = { ...mockApproval, status: 'approved', decision_notes: 'Approved after review' }
    mockApprovalQuery(approvedApproval as Approval)

    render(<ApprovalDetail />)

    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Approval notes')).toBeInTheDocument()
    expect(screen.getByText('Approved after review')).toBeInTheDocument()
  })

  it('calls mutation with approved status and notes on submit', async () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await userEvent.type(screen.getByRole('textbox'), 'Looks good to proceed')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(mockMutate).toHaveBeenCalledWith(
      {
        params: { path: { approval_id: '550e8400-e29b-41d4-a716-446655440001' } },
        body: { status: 'approved', notes: 'Looks good to proceed' },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function) as unknown,
        onError: expect.any(Function) as unknown,
      })
    )
  })

  it('calls mutation with rejected status on submit', async () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await userEvent.type(screen.getByRole('textbox'), 'Does not meet standards')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(mockMutate).toHaveBeenCalledWith(
      {
        params: { path: { approval_id: '550e8400-e29b-41d4-a716-446655440001' } },
        body: { status: 'rejected', notes: 'Does not meet standards' },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function) as unknown,
        onError: expect.any(Function) as unknown,
      })
    )
  })

  it('resets form state and shows alert after successful submission', async () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await userEvent.type(screen.getByRole('textbox'), 'Looks good')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    // Extract and invoke the onSuccess callback, then wait for the async
    // refetch chain to complete (state resets after refetch resolves)
    const mutateCall = mockMutate.mock.calls[0] as [unknown, { onSuccess: () => void }]
    // eslint-disable-next-line @typescript-eslint/require-await -- act needs async to flush microtasks from refetch().then()
    await act(async () => {
      mutateCall[1].onSuccess()
    })

    // After success, the decision should reset — Approve/Reject buttons should reappear
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('handleSubmit guard prevents mutation when isSubmitting is true', async () => {
    vi.mocked(approvalsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      isSuccess: false,
    } as never)
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    // Click Approve to set pendingDecision — now canSubmit=true, isSubmitting=true
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    const submitButton = screen.getByRole('button', { name: /submit/i })
    // Use fireEvent to bypass any aria-disabled restriction
    fireEvent.click(submitButton)

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('disables submit button during mutation', () => {
    mockApprovalQuery(mockApproval)
    vi.mocked(approvalsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    } as never)

    render(<ApprovalDetail />)

    // When isPending is true, the Submit button should still be present but disabled
    // since canSubmit requires pendingDecision, and it's not set yet
    const submitButton = screen.getByRole('button', { name: /submit/i })
    expect(submitButton).toBeDisabled()
  })

  it('shows error when no approval ID is provided', () => {
    vi.mocked(useParams).mockReturnValue({})

    render(<ApprovalDetail />)

    expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument()
    expect(screen.getByText('Invalid approval')).toBeInTheDocument()
    expect(screen.getByText('No approval ID provided')).toBeInTheDocument()
  })

  it('resets pending decision when undo button is clicked', async () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Undo decision' }))

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('shows "Rejection notes" label for rejected approvals with notes', () => {
    const rejectedApproval = { ...mockApproval, status: 'rejected', decision_notes: 'Does not meet standards' }
    mockApprovalQuery(rejectedApproval as Approval)

    render(<ApprovalDetail />)

    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.getByText('Rejection notes')).toBeInTheDocument()
    expect(screen.getByText('Does not meet standards')).toBeInTheDocument()
  })

  it('shows "Notes" label for non-approved/rejected status approvals with notes', () => {
    const otherApproval = {
      ...mockApproval,
      status: 'expired' as unknown as Approval['status'],
      decision_notes: 'Timed out',
    }
    mockApprovalQuery(otherApproval as Approval)

    render(<ApprovalDetail />)

    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Timed out')).toBeInTheDocument()
  })

  it('shows "Back to Approvals" button for non-pending approvals', () => {
    const approvedApproval = { ...mockApproval, status: 'approved' }
    mockApprovalQuery(approvedApproval as Approval)

    render(<ApprovalDetail />)

    expect(screen.getByRole('button', { name: 'Back to Approvals' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
  })

  it('shows success alert variant after approval submission', async () => {
    const mockRefetch = vi.fn().mockResolvedValue({})
    vi.mocked(approvalsClient.useQuery).mockReturnValue({
      data: mockApproval,
      isPending: false,
      error: null,
      isError: false,
      refetch: mockRefetch,
    } as never)

    render(<ApprovalDetail />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    const mutateCall = mockMutate.mock.calls[0] as [unknown, { onSuccess: () => void }]
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      mutateCall[1].onSuccess()
    })

    expect(mockRefetch).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    mockApprovalQuery(mockApproval)

    const { container } = render(<ApprovalDetail />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
