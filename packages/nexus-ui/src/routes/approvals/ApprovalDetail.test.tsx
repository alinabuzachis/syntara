import type { Approval } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useLocation, useParams } from 'wouter'

import { workflowClient } from '../../client'

import ApprovalDetail from './ApprovalDetail'

// Mock the workflowClient
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
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
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
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
    vi.mocked(useParams).mockReturnValue({ approvalId: '550e8400-e29b-41d4-a716-446655440001' })
    vi.mocked(useLocation).mockReturnValue(['/', vi.fn()])
    // Disable mock approvals in tests so we can test with mocked query data
    vi.stubEnv('VITE_USE_MOCK_APPROVALS', 'false')
  })

  const mockApprovalQuery = (data: Approval | null, isPending = false, error: unknown = null) => {
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: data,
      isPending,
      error,
      isError: !!error,
      refetch: vi.fn(),
    } as never)
  }

  it('renders the approval detail page', () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    expect(screen.getByText('Test Approval')).toBeInTheDocument()
    expect(screen.getByText('Approval type')).toBeInTheDocument()
    expect(screen.getByText('Automation')).toBeInTheDocument()
    expect(screen.getByText('Approval initiated')).toBeInTheDocument()
  })

  it('displays approval name in header', () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    // The approval name should be in the page header
    expect(screen.getByText('Test Approval')).toBeInTheDocument()
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

    expect(screen.getByText('Approval Details')).toBeInTheDocument()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockApprovalQuery(null, false, { message: 'Failed to load' })

    render(<ApprovalDetail />)

    expect(screen.getByText('Approval Details')).toBeInTheDocument()
    expect(screen.getByText('Error loading approval')).toBeInTheDocument()
  })

  it('uses approval ID as fallback name when name not provided', () => {
    const approvalWithoutName: Approval = {
      // BaseResource fields
      id: '550e8400-e29b-41d4-a716-446655440002',
      createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
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

    // Should fall back to approval ID
    expect(screen.getByText('550e8400-e29b-41d4-a716-446655440002')).toBeInTheDocument()
  })

  it('shows approve/reject actions for pending approvals', () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('requires notes before enabling submit', async () => {
    mockApprovalQuery(mockApproval)

    render(<ApprovalDetail />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const submitButton = screen.getByRole('button', { name: 'Submit' })
    expect(submitButton).toBeDisabled()

    await userEvent.type(screen.getByRole('textbox'), 'Looks good')
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
})
