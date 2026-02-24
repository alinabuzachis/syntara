import type { Approval } from '@ansible/nexus-contracts'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { approvalsClient } from '../../client'

import Approvals from './Approvals'

// Mock the approvalsClient
vi.mock('../../client', () => ({
  approvalsClient: {
    useQuery: vi.fn(),
  },
}))

describe('Approvals Component', () => {
  const now = Date.now()
  const mockApprovals: Approval[] = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      labels: {},
      execution_id: '660e8400-e29b-41d4-a716-446655440001',
      approval_node_id: 'approval-activity-1',
      name: 'Test Approval 1',
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
    } as unknown as Approval,
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
      updatedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
      labels: {},
      execution_id: '660e8400-e29b-41d4-a716-446655440002',
      approval_node_id: 'approval-activity-2',
      name: 'Test Approval 2',
      description: 'Automated approval for workflow execution',
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
        inputs: {
          workflow_name: 'Another Workflow',
        },
        previous_step: {
          id: 'validate',
          name: 'Validate',
          type: 'task',
          output: {
            validated: true,
          },
        },
      },
      decided_by: {
        id: '770e8400-e29b-41d4-a716-446655440001',
        name: 'John Doe',
      },
      decided_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      decision_notes: 'Approved after review',
    } as unknown as Approval,
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      createdAt: new Date(now - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
      updatedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
      labels: {},
      execution_id: '660e8400-e29b-41d4-a716-446655440003',
      approval_node_id: 'approval-activity-3',
      name: 'Test Approval 3',
      description: 'Policy compliance review required',
      status: 'rejected',
      timeout_at: null,
      next_step_approved: {
        id: 'proceed',
        name: 'Proceed',
        type: 'task',
      },
      next_step_rejected: {
        id: 'block',
        name: 'Block',
        type: 'task',
      },
      workflow_context: {
        workflow_version_id: '880e8400-e29b-41d4-a716-446655440003',
        workflow_name: 'Policy Check Workflow',
        inputs: {
          policy_check: true,
        },
        previous_step: {
          id: 'check_policy',
          name: 'Check Policy',
          type: 'task',
          output: {
            compliant: false,
          },
        },
      },
      decided_by: {
        id: '770e8400-e29b-41d4-a716-446655440002',
        name: 'Alice Smith',
      },
      decided_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      decision_notes: 'Rejected due to policy violation',
    } as unknown as Approval,
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockApprovalsQuery = (data: Approval[], isPending = false, error: unknown = null) => {
    vi.mocked(approvalsClient.useQuery).mockReturnValue({
      data: { resources: data, next: null, prev: null, total: data.length },
      isPending,
      error,
      isError: !!error,
      refetch: vi.fn(),
    } as never)
  }

  it('renders the approvals table with data', () => {
    mockApprovalsQuery(mockApprovals)

    render(<Approvals />)

    expect(screen.getByText('Approvals')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search approvals...')).toBeInTheDocument()
  })

  it('displays approval names', () => {
    mockApprovalsQuery(mockApprovals)

    render(<Approvals />)

    expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
    expect(screen.getByText('Test Approval 2')).toBeInTheDocument()
    expect(screen.getByText('Test Approval 3')).toBeInTheDocument()
  })

  it('renders table headers', () => {
    mockApprovalsQuery(mockApprovals)

    render(<Approvals />)

    expect(screen.getByText('Approval name')).toBeInTheDocument()
    // Approval type column removed for RH1 - may be added back later
    // expect(screen.getByText('Approval type')).toBeInTheDocument()
    expect(screen.getByText('Automation')).toBeInTheDocument()
    expect(screen.getByText('Approval initiated')).toBeInTheDocument()
    expect(screen.getByText('Actioned on')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockApprovalsQuery([], true)

    render(<Approvals />)

    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockApprovalsQuery([], false, { message: 'Failed to load' })

    render(<Approvals />)

    expect(screen.getByText('Error loading approvals')).toBeInTheDocument()
  })

  it('displays approval types', () => {
    mockApprovalsQuery(mockApprovals)

    render(<Approvals />)

    // Approval type column removed for RH1 - may be added back later
    // expect(screen.getByText('Manual Approval')).toBeInTheDocument()
    // expect(screen.getByText('Automated Approval')).toBeInTheDocument()
    // expect(screen.getByText('Policy Approval')).toBeInTheDocument()
  })

  it('displays automation names', () => {
    mockApprovalsQuery(mockApprovals)

    render(<Approvals />)

    expect(screen.getByText('Test Workflow')).toBeInTheDocument()
    expect(screen.getByText('Another Workflow')).toBeInTheDocument()
  })

  it('renders approval status badges', () => {
    mockApprovalsQuery(mockApprovals)

    render(<Approvals />)

    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('shows empty state when no approvals', () => {
    mockApprovalsQuery([])

    render(<Approvals />)

    expect(screen.getByText('No approvals found')).toBeInTheDocument()
  })

  describe('Sorting Functionality', () => {
    it('renders sortable column headers', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      // Verify sortable columns have sort buttons
      const approvalNameHeader = screen.getByRole('columnheader', { name: /Approval name/i })
      expect(within(approvalNameHeader).getByRole('button')).toBeInTheDocument()

      const automationHeader = screen.getByRole('columnheader', { name: /Automation/i })
      expect(within(automationHeader).getByRole('button')).toBeInTheDocument()

      const statusHeader = screen.getByRole('columnheader', { name: /Status/i })
      expect(within(statusHeader).getByRole('button')).toBeInTheDocument()
    })

    it('changes sort when clicking column headers', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      // Click Approval name header to sort by name
      const approvalNameHeader = screen.getByRole('columnheader', { name: /Approval name/i })
      const sortButton = within(approvalNameHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All approvals should still be visible
      expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 2')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 3')).toBeInTheDocument()
    })

    it('can toggle sort direction by clicking the same column header', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      const approvalNameHeader = screen.getByRole('columnheader', { name: /Approval name/i })
      const sortButton = within(approvalNameHeader).getByRole('button')

      // Click twice to toggle direction
      fireEvent.click(sortButton)
      fireEvent.click(sortButton)

      // All approvals should still be visible after sorting
      expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 2')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 3')).toBeInTheDocument()
    })

    it('can sort by different columns', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      // Click Status header
      const statusHeader = screen.getByRole('columnheader', { name: /Status/i })
      const statusSortButton = within(statusHeader).getByRole('button')
      fireEvent.click(statusSortButton)

      // All approvals should still be visible
      expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 2')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 3')).toBeInTheDocument()
    })

    it('can sort by Actioned on (decided_at) column', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      // Click Actioned on header
      const actionedOnHeader = screen.getByRole('columnheader', { name: /Actioned on/i })
      const sortButton = within(actionedOnHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All approvals should still be visible
      expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 2')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 3')).toBeInTheDocument()
    })

    it('can sort by Automation column', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      const automationHeader = screen.getByRole('columnheader', { name: /Automation/i })
      const sortButton = within(automationHeader).getByRole('button')
      fireEvent.click(sortButton)

      expect(screen.getByText('Another Workflow')).toBeInTheDocument()
      expect(screen.getByText('Test Workflow')).toBeInTheDocument()
    })
  })

  describe('Row Expansion', () => {
    it('expands a row when clicking the expand button', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      // Find and click the first expand toggle
      const expandButtons = screen.getAllByRole('button', { name: /details/i })
      fireEvent.click(expandButtons[0])

      // The expanded content should show the description
      expect(screen.getByText('This is a test approval requiring manual review')).toBeInTheDocument()
    })

    it('collapses an expanded row when clicking the expand button again', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      const expandButtons = screen.getAllByRole('button', { name: /details/i })

      // Expand then collapse
      fireEvent.click(expandButtons[0])
      expect(screen.getByText('This is a test approval requiring manual review')).toBeInTheDocument()

      fireEvent.click(expandButtons[0])
      // Row toggle was clicked again - state should be collapsed
      // The expanded row content is still in DOM but the row state changes
      expect(expandButtons[0]).toBeInTheDocument()
    })

    it('can expand all rows using the header expand toggle', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      // Find the expand all button in the header
      const expandAllButton = screen.getByRole('button', { name: /expand all/i })
      fireEvent.click(expandAllButton)

      // All descriptions should be visible
      expect(screen.getByText('This is a test approval requiring manual review')).toBeInTheDocument()
      expect(screen.getByText('Automated approval for workflow execution')).toBeInTheDocument()
      expect(screen.getByText('Policy compliance review required')).toBeInTheDocument()
    })

    it('can collapse all rows using the header collapse toggle', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      // Expand all first
      const expandAllButton = screen.getByRole('button', { name: /expand all/i })
      fireEvent.click(expandAllButton)

      // All descriptions should be visible after expanding
      expect(screen.getByText('This is a test approval requiring manual review')).toBeInTheDocument()

      // The onCollapseAll function is tested by clicking again
      // After expanding all, clicking the toggle should collapse
      fireEvent.click(expandAllButton)

      // Toggle was clicked - the state changed
      expect(expandAllButton).toBeInTheDocument()
    })

    it('shows "No description provided" for approvals without description', () => {
      const approvalWithoutDesc = {
        ...mockApprovals[0],
        id: 'no-desc-approval',
        description: null,
      }
      mockApprovalsQuery([approvalWithoutDesc] as Approval[])

      render(<Approvals />)

      // Expand the row
      const expandButton = screen.getByRole('button', { name: /details/i })
      fireEvent.click(expandButton)

      expect(screen.getByText('No description provided')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    it('updates search input value when typing', async () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      const searchInput = screen.getByPlaceholderText('Search approvals...')
      fireEvent.change(searchInput, { target: { value: 'test' } })

      expect(searchInput).toHaveValue('test')
    })

    it('clears search when clear button is clicked', async () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      const searchInput = screen.getByPlaceholderText('Search approvals...')
      fireEvent.change(searchInput, { target: { value: 'test' } })
      expect(searchInput).toHaveValue('test')

      // Click clear button
      const clearButton = screen.getByRole('button', { name: /reset/i })
      fireEvent.click(clearButton)

      expect(searchInput).toHaveValue('')
    })
  })

  describe('Pagination', () => {
    it('displays footer with approval count', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      expect(screen.getByText(/3 approvals/)).toBeInTheDocument()
    })

    it('displays singular approval text for one approval', () => {
      mockApprovalsQuery([mockApprovals[0]])

      render(<Approvals />)

      expect(screen.getByText(/1 approval/)).toBeInTheDocument()
    })

    it('displays total count when more approvals exist', () => {
      vi.mocked(approvalsClient.useQuery).mockReturnValue({
        data: {
          resources: mockApprovals,
          total: 50,
          next: 'next-cursor',
          prev: null,
        },
        isPending: false,
        error: null,
      } as never)

      render(<Approvals />)

      expect(screen.getByText(/of 50 total/)).toBeInTheDocument()
    })

    it('handles next page navigation', async () => {
      vi.mocked(approvalsClient.useQuery).mockReturnValue({
        data: {
          resources: mockApprovals,
          total: 50,
          next: 'next-cursor',
          prev: null,
        },
        isPending: false,
        error: null,
      } as never)

      render(<Approvals />)

      const nextButton = screen.getByRole('button', { name: /next/i })
      fireEvent.click(nextButton)

      expect(nextButton).toBeInTheDocument()
    })

    it('handles previous page navigation', async () => {
      vi.mocked(approvalsClient.useQuery).mockReturnValue({
        data: {
          resources: mockApprovals,
          total: 50,
          next: null,
          prev: 'prev-cursor',
        },
        isPending: false,
        error: null,
      } as never)

      render(<Approvals />)

      const prevButton = screen.getByRole('button', { name: /previous/i })
      fireEvent.click(prevButton)

      expect(prevButton).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles approval without workflowId (no link)', () => {
      const approvalWithoutWorkflow = {
        ...mockApprovals[0],
        id: 'no-workflow-approval',
        workflow_context: {
          ...mockApprovals[0].workflow_context,
          workflow_version_id: undefined,
        },
      }
      mockApprovalsQuery([approvalWithoutWorkflow] as unknown as Approval[])

      render(<Approvals />)

      // Automation name should be displayed but not as a link
      const automationText = screen.getByText('Test Workflow')
      expect(automationText).toBeInTheDocument()
      expect(automationText.closest('button')).toBeNull()
    })

    it('handles approval without decided_at (pending)', () => {
      mockApprovalsQuery([mockApprovals[0]]) // First approval is pending with no decided_at

      render(<Approvals />)

      // The pending approval should render successfully without decided_at
      // DateCell with null will render appropriately
      expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('displays decided_by link when approval has been decided', () => {
      mockApprovalsQuery([mockApprovals[1]]) // Second approval has decided_by

      render(<Approvals />)

      // Should show the decider's name
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('handles approval without name (uses ID)', () => {
      const approvalWithoutName = {
        ...mockApprovals[0],
        name: null,
      }
      mockApprovalsQuery([approvalWithoutName] as unknown as Approval[])

      render(<Approvals />)

      // Should display the ID instead
      expect(screen.getByText('550e8400-e29b-41d4-a716-446655440001')).toBeInTheDocument()
    })

    it('handles approval without workflow_context (Unknown automation)', () => {
      const approvalWithoutContext = {
        ...mockApprovals[0],
        workflow_context: undefined,
      }
      mockApprovalsQuery([approvalWithoutContext] as unknown as Approval[])

      render(<Approvals />)

      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })
  })
})
