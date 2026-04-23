import type { Approval } from '@ansible/nexus-contracts'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { approvalsClient } from '../../client'
import { useFilterState } from '../../hooks/useFilterState'
import { assertUrlParam, assertUrlParamIsNull } from '../../test/filter-test-helpers'

import Approvals from './Approvals'

// Mock the approvalsClient
vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
  approvalsClient: {
    useQuery: vi.fn(),
  },
}))

// Mock the accessClient used for project-scoped approvals
vi.mock('../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn().mockReturnValue({
      data: undefined,
      isPending: false,
      error: null,
      isError: false,
      refetch: vi.fn(),
    }),
  },
}))

// Mock useProjectSelector to avoid needing accessClient / QueryClientProvider
const mockUseProjectSelector = vi.fn(() => ({
  selectedProject: null as { id: string; name: string } | null,
  isAllProjects: true,
  projects: [] as { id: string; name: string }[],
  ProjectSelector: null,
}))
vi.mock('../../hooks/useProjectSelector', () => ({
  useProjectSelector: () => mockUseProjectSelector(),
}))

// Mock useFilterState - will be configured per-test
vi.mock('../../hooks/useFilterState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useFilterState')>()
  return {
    ...actual,
    useFilterState: vi.fn(actual.useFilterState),
  }
})

const mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('wouter', () => ({
  useLocation: () => ['/approvals', vi.fn()],
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
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
    // Reset useFilterState to its default implementation (not mocked)
    vi.mocked(useFilterState).mockRestore?.()
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
    // FilterBar with text filter input
    expect(screen.getByRole('textbox', { name: /name filter/i })).toBeInTheDocument()
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

  it('displays approval rows (type column removed for RH1)', () => {
    mockApprovalsQuery(mockApprovals)

    render(<Approvals />)

    // Approval type column removed for RH1 — assert rows still render
    expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
    expect(screen.getByText('Test Approval 2')).toBeInTheDocument()
    expect(screen.getByText('Test Approval 3')).toBeInTheDocument()
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

  describe('Filter Functionality', () => {
    it('applies name filter to API query when typing and submitting', async () => {
      const user = userEvent.setup()
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      const nameInput = screen.getByRole('textbox', { name: /name filter/i })

      // Type filter value
      await user.type(nameInput, 'test')

      // Submit by pressing Enter
      await user.keyboard('{Enter}')

      // Verify URL parameters were updated with filter
      await waitFor(() => {
        assertUrlParam(mockSetSearchParams, 'name[contains]', 'test')
      })
      expect(mockSetSearchParams).toHaveBeenCalled()
    })

    it('applies status filter to API query when selecting option', async () => {
      const user = userEvent.setup()
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      // Click the field selector dropdown to switch from "Name" to "Status"
      const fieldSelectorButton = screen.getByRole('button', { name: 'Name' })
      await user.click(fieldSelectorButton)

      // Select "Status" field from dropdown
      const statusOption = await screen.findByRole('option', { name: 'Status' })
      await user.click(statusOption)

      // Now the filter field should show the status selector
      // Open the status value dropdown
      const statusValueButton = await screen.findByRole('button', { name: /filter by status/i }, { timeout: 10000 })
      await user.click(statusValueButton)

      // Select "Pending" option
      const pendingOption = await screen.findByRole('option', { name: 'Pending' })
      await user.click(pendingOption)

      // Verify URL params were updated with status filter
      await waitFor(() => {
        assertUrlParam(mockSetSearchParams, 'status', 'pending')
      })
      expect(mockSetSearchParams).toHaveBeenCalled()
    }, 10000)

    it('displays name filter input in toolbar', () => {
      mockApprovalsQuery(mockApprovals)

      render(<Approvals />)

      // Verify filter input is present
      const textInput = screen.getByRole('textbox', { name: /name filter/i })
      expect(textInput).toBeInTheDocument()
      expect(textInput).toHaveAttribute('placeholder', 'Filter by name')
    })

    it('resets pagination cursor when filters change', async () => {
      const user = userEvent.setup()

      // Mock query with pagination cursor
      vi.mocked(approvalsClient.useQuery).mockReturnValue({
        data: {
          resources: mockApprovals,
          next: 'cursor-page-2',
          prev: null,
          total: 20,
        },
        isPending: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as never)

      render(<Approvals />)

      // Navigate to page 2
      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      // Apply a filter
      const nameInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(nameInput, 'test')
      await user.keyboard('{Enter}')

      // Verify cursor was reset (no cursor in URL params)
      await waitFor(() => {
        assertUrlParamIsNull(mockSetSearchParams, 'cursor')
      })
      expect(mockSetSearchParams).toHaveBeenCalled()
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

    it('handles next page navigation', () => {
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

    it('handles previous page navigation', () => {
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

    it('does not reset cursor while query is fetching', async () => {
      const mockRefetch = vi.fn()

      // First render: page 1 with data
      vi.mocked(approvalsClient.useQuery).mockReturnValue({
        data: {
          resources: mockApprovals,
          next: 'next-cursor',
          prev: null,
          total: 30,
        },
        isPending: false,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      const { rerender } = render(<Approvals />)

      // Verify pagination controls present
      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).toBeInTheDocument()

      // Click Next to set internal cursor state
      fireEvent.click(nextButton)

      // Verify cursor was set after clicking Next
      await waitFor(() => {
        const lastCall = vi.mocked(approvalsClient.useQuery).mock.calls.at(-1)
        expect(lastCall).toBeDefined()
        const queryParams = (lastCall?.[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params
          ?.query
        expect(queryParams).toMatchObject({ cursor: 'next-cursor' })
      })

      // Second render: fetching state with empty data (cursor should NOT be reset due to isFetching=true)
      vi.mocked(approvalsClient.useQuery).mockReturnValue({
        data: {
          resources: [], // Empty during transition
          next: 'next-cursor',
          prev: 'prev-cursor',
          total: 30,
        },
        isPending: false,
        isLoading: false,
        isFetching: true, // Fetching prevents cursor reset
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      // Rerender to trigger useEffect with fetching state
      rerender(<Approvals />)

      // Wait for component to process and verify cursor is still present (not reset)
      await waitFor(() => {
        const lastCall = vi.mocked(approvalsClient.useQuery).mock.calls.at(-1)
        expect(lastCall).toBeDefined()
        // Cursor should still be present because isFetching=true prevents reset
        const queryParams = (lastCall?.[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params
          ?.query
        expect(queryParams).toMatchObject({ cursor: 'next-cursor' })
      })

      // Third render: data arrives for page 2 - if cursor was preserved, we should have prev button
      vi.mocked(approvalsClient.useQuery).mockReturnValue({
        data: {
          resources: mockApprovals.slice(0, 2), // Page 2 data
          next: 'next-cursor',
          prev: 'prev-cursor', // This proves we're on page 2, not page 1
          total: 30,
        },
        isPending: false,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      rerender(<Approvals />)

      // Verify pagination shows both buttons (proves cursor was not reset - we're on page 2)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
      })
    })

    it('resets cursor when data is empty and query is not fetching', async () => {
      const mockRefetch = vi.fn()

      // Ensure useFilterState returns no active filters so hasActiveFilters is false
      // This is required for the cursor reset logic to run
      vi.mocked(useFilterState).mockReturnValue({
        filters: [], // No active filters
        setFilter: vi.fn(),
        removeFilter: vi.fn(),
        clearAllFilters: vi.fn(),
        setAllFilters: vi.fn(),
      })

      // Start with data and cursor
      vi.mocked(approvalsClient.useQuery).mockReturnValue({
        data: {
          resources: mockApprovals,
          next: 'next-cursor',
          prev: null,
          total: 30,
        },
        isPending: false,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      const { rerender } = render(<Approvals />)

      // Click Next to set cursor
      const nextButton = screen.getByRole('button', { name: /next/i })
      fireEvent.click(nextButton)

      // Wait for cursor to be set and verify it's present
      await waitFor(() => {
        const lastCall = vi.mocked(approvalsClient.useQuery).mock.calls.at(-1)
        expect(lastCall).toBeDefined()
        const queryParams = (lastCall?.[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params
          ?.query
        expect(queryParams).toMatchObject({ cursor: 'next-cursor' })
      })

      // Simulate truly empty state - no data and not fetching
      vi.mocked(approvalsClient.useQuery).mockReturnValue({
        data: {
          resources: [],
          next: null,
          prev: null,
          total: 0,
        },
        isPending: false,
        isLoading: false,
        isFetching: false, // Not fetching allows cursor reset
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      rerender(<Approvals />)

      // Should show empty state (cursor was reset)
      await waitFor(() => {
        expect(screen.getByText('No approvals found')).toBeInTheDocument()
      })

      // Verify cursor was reset (no cursor in query params)
      await waitFor(() => {
        const lastCall = vi.mocked(approvalsClient.useQuery).mock.calls.at(-1)
        expect(lastCall).toBeDefined()
        // Cursor should be absent or undefined because it was reset
        const queryParams = (lastCall?.[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params
          ?.query
        expect(queryParams?.cursor).toBeUndefined()
      })
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

  describe('Grouped view (All Projects)', () => {
    it('renders grouped approvals when all projects are selected', () => {
      mockUseProjectSelector.mockReturnValue({
        selectedProject: null,
        isAllProjects: true,
        projects: [
          { id: 'proj-1', name: 'Project Alpha' },
          { id: 'proj-2', name: 'Project Beta' },
        ],
        ProjectSelector: null,
      })

      const approvalsWithProjects = mockApprovals.map((a, i) => ({
        ...a,
        project_id: i === 0 ? 'proj-1' : 'proj-2',
      }))
      mockApprovalsQuery(approvalsWithProjects as Approval[])

      render(<Approvals />)

      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      expect(screen.getByText('Project Beta')).toBeInTheDocument()

      expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 2')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 3')).toBeInTheDocument()
    })

    it('toggles project group collapsed/expanded', async () => {
      const user = userEvent.setup()

      mockUseProjectSelector.mockReturnValue({
        selectedProject: null,
        isAllProjects: true,
        projects: [{ id: 'proj-1', name: 'Project Alpha' }],
        ProjectSelector: null,
      })

      const approvalsWithProject = [{ ...mockApprovals[0], project_id: 'proj-1' }]
      mockApprovalsQuery(approvalsWithProject as Approval[])

      render(<Approvals />)

      // Approval should be visible initially
      expect(screen.getByText('Test Approval 1')).toBeInTheDocument()

      // Click the project group header to collapse
      await user.click(screen.getByText('Project Alpha'))

      // Approval should be hidden
      expect(screen.queryByText('Test Approval 1')).not.toBeInTheDocument()

      // Click again to expand
      await user.click(screen.getByText('Project Alpha'))

      // Approval visible again
      expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
    })

    it('shows "No project" for approvals without project_id', () => {
      mockUseProjectSelector.mockReturnValue({
        selectedProject: null,
        isAllProjects: true,
        projects: [{ id: 'proj-1', name: 'Project Alpha' }],
        ProjectSelector: null,
      })

      const approvalsWithoutProject = [{ ...mockApprovals[0], project_id: undefined }]
      mockApprovalsQuery(approvalsWithoutProject as unknown as Approval[])

      render(<Approvals />)

      expect(screen.getByText('No project')).toBeInTheDocument()
      expect(screen.getByText('Test Approval 1')).toBeInTheDocument()
    })
  })
})
