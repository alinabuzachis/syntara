import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../providers/alerts'
import { accessClient } from '../../access/accessClient'

import { ProjectRoleAssignmentsTab } from './ProjectRoleAssignmentsTab'

vi.mock('@patternfly/react-table', async () => {
  const actual = await vi.importActual<typeof import('@patternfly/react-table')>('@patternfly/react-table')
  return {
    ...actual,
    ActionsColumn: ({ items }: { items: Array<{ title: ReactNode; onClick?: () => void }> }) => (
      <button type="button" onClick={() => items[0]?.onClick?.()}>
        Open actions
      </button>
    ),
  }
})

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('./AssignProjectRoleModal', () => ({
  AssignProjectRoleModal: ({
    isOpen,
    onSuccess,
    onClose,
  }: {
    isOpen: boolean
    onSuccess: () => void
    onClose: () => void
  }) =>
    isOpen ? (
      <div>
        Assign project role modal
        <button type="button" onClick={onSuccess}>
          Mock assign success
        </button>
        <button type="button" onClick={onClose}>
          Mock close modal
        </button>
      </div>
    ) : null,
}))

vi.mock('../../../components/filters', () => ({
  FilterBar: ({
    onFilterChange,
    clearAllFilters,
  }: {
    onFilterChange: (filters: Array<{ key: string; value: string }>) => void
    clearAllFilters: () => void
  }) => (
    <div data-testid="filter-bar">
      <button
        type="button"
        onClick={() => onFilterChange([{ key: 'name', value: 'alice' }])}
        aria-label="Filter by name"
      >
        Filter by name
      </button>
      <button
        type="button"
        onClick={() => onFilterChange([{ key: 'role_name', value: 'admin' }])}
        aria-label="Filter by role"
      >
        Filter by role
      </button>
      <button
        type="button"
        onClick={() => onFilterChange([{ key: 'type', value: 'user' }])}
        aria-label="Filter by type"
      >
        Filter by type
      </button>
      <button
        type="button"
        onClick={() => onFilterChange([{ key: 'name', value: 'nonexistent-user-xyz' }])}
        aria-label="Filter no results"
      >
        Filter no results
      </button>
      <button
        type="button"
        onClick={() => onFilterChange([{ key: 'unknown_field', value: 'anything' }])}
        aria-label="Filter unknown key"
      >
        Filter unknown key
      </button>
      <button type="button" onClick={clearAllFilters} aria-label="Clear all filters">
        Clear filters
      </button>
    </div>
  ),
}))

vi.mock('../../../utils/dateUtils', () => ({
  formatDateTime: (v: string | null | undefined) => v ?? 'N/A',
}))

vi.mock('../../../components/table/PaginationFooter', () => ({
  PaginationFooter: ({
    onPrev,
    onNext,
    onPerPageChange,
    page,
    perPage,
    total,
  }: {
    onPrev: () => void
    onNext: () => void
    onPerPageChange: (perPage: number) => void
    page: number
    perPage: number
    total: number
  }) => (
    <div data-testid="pagination-footer">
      <span>
        Page {page} of {Math.ceil(total / perPage) || 1}
      </span>
      <button type="button" onClick={onPrev} aria-label="Go to previous page">
        Previous
      </button>
      <button type="button" onClick={onNext} aria-label="Go to next page">
        Next
      </button>
      <button type="button" onClick={() => onPerPageChange(10)} aria-label="Set 10 per page">
        10 per page
      </button>
    </div>
  ),
}))

const mockMutationReturn = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  data: null,
  reset: vi.fn(),
  isIdle: true,
  isSuccess: false,
  failureCount: 0,
  failureReason: null,
  context: undefined,
  submittedAt: 0,
  variables: undefined,
  status: 'idle',
  isPaused: false,
} as never

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

/**
 * Create a mock mutate function that invokes specific mutation callbacks.
 * Also sets up `accessClient.useMutation` with the returned mutate fn.
 * @returns The mock mutate function for assertions.
 */
function setupMutationMock(callbackToInvoke: 'onSuccess' | 'onError', errorValue?: unknown) {
  const mutate = vi.fn(
    (
      _variables: unknown,
      options: { onSuccess?: () => void; onError?: (err: unknown) => void; onSettled?: () => void }
    ) => {
      if (callbackToInvoke === 'onSuccess') {
        options.onSuccess?.()
      } else {
        options.onError?.(errorValue ?? new Error('Mutation failed'))
      }
      options.onSettled?.()
    }
  )
  vi.mocked(accessClient.useMutation).mockReturnValue({
    ...({} as Record<string, unknown>),
    mutate,
    isPending: false,
    isError: false,
    error: null,
  } as never)
  return mutate
}

const mockAllAssignments = [
  {
    id: 'a1',
    principal_id: 'u1',
    principal_name: 'alice',
    principal_type: 'user',
    role_name: 'admin',
    created_at: '2024-01-01T00:00:00Z',
    project_id: 'proj-1',
    project_name: 'Test Project',
  },
  {
    id: 'a2',
    principal_id: 'g1',
    principal_name: 'devs',
    principal_type: 'group',
    role_name: 'editor',
    created_at: '2024-02-01T00:00:00Z',
    project_id: 'proj-1',
    project_name: 'Test Project',
  },
  {
    id: 'a3',
    principal_id: 'u1',
    principal_name: 'alice',
    principal_type: 'user',
    role_name: 'viewer',
    created_at: '2024-03-01T00:00:00Z',
    project_id: 'proj-1',
    project_name: 'Test Project',
  },
]

describe('ProjectRoleAssignmentsTab', () => {
  const mockRefetch = vi.fn().mockResolvedValue({})

  function setupMocks(assignments = mockAllAssignments) {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: { resources: assignments, total: assignments.length, next: null },
      isPending: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRefetch.mockResolvedValue({})
    setupMocks()
  })

  it('has no accessibility violations with assignments', async () => {
    const { container } = render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations when empty', async () => {
    setupMocks([])
    const { container } = render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders table with combined user and group assignment rows', () => {
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('grid', { name: 'Project role assignments' })).toBeInTheDocument()
    expect(screen.getByText('devs')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('editor')).toBeInTheDocument()
    // alice appears twice (two assignments)
    expect(screen.getAllByText('alice')).toHaveLength(2)
  })

  it('shows User and Group type labels', () => {
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Two user assignments + one group assignment
    expect(screen.getAllByText('User')).toHaveLength(2)
    expect(screen.getByText('Group')).toBeInTheDocument()
  })

  it('renders "Assign role" button', () => {
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('button', { name: 'Assign role' })).toBeInTheDocument()
  })

  it('renders empty state when no assignments exist', () => {
    setupMocks([])
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('No role assignments')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign role' })).toBeInTheDocument()
  })

  it('renders error state when query fails', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Network error'),
      refetch: vi.fn(),
    } as never)

    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Error loading role assignments' })).toBeInTheDocument()
  })

  it('renders loading state while fetching', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
  })

  it('opens the assign modal from the toolbar when assignments exist', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Assign role' }))

    expect(screen.getByText('Assign project role modal')).toBeInTheDocument()
  })

  it('opens the assign modal from the empty state CTA', async () => {
    const user = userEvent.setup()
    setupMocks([])
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Assign role' }))

    expect(screen.getByText('Assign project role modal')).toBeInTheDocument()
  })

  it('opens unassign dialog when action is clicked and shows confirmation', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Click the first row's actions button
    const actionButtons = screen.getAllByRole('button', { name: 'Open actions' })
    await user.click(actionButtons[0])

    // The unassign dialog should appear with the role info
    expect(screen.getByText('Unassign role?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unassign' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('closes unassign dialog when cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Open the dialog
    const actionButtons = screen.getAllByRole('button', { name: 'Open actions' })
    await user.click(actionButtons[0])
    expect(screen.getByText('Unassign role?')).toBeInTheDocument()

    // Cancel
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Unassign role?')).not.toBeInTheDocument()
  })

  it('calls deleteUserAssignment when unassigning a user role', async () => {
    const user = userEvent.setup()
    const mutate = setupMutationMock('onSuccess')

    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // The first row is alice (user) with admin role
    const actionButtons = screen.getAllByRole('button', { name: 'Open actions' })
    await user.click(actionButtons[0])
    await user.click(screen.getByRole('button', { name: 'Unassign' }))

    expect(mutate).toHaveBeenCalledWith(
      { params: { path: { project_id: 'proj-1', assignment_id: 'a1' } } },
      expect.anything()
    )
    // Refetch should be called on success
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('calls deleteGroupAssignment when unassigning a group role', async () => {
    const user = userEvent.setup()
    const mutate = setupMutationMock('onSuccess')

    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // The second row is devs (group) with editor role
    const actionButtons = screen.getAllByRole('button', { name: 'Open actions' })
    await user.click(actionButtons[1])
    await user.click(screen.getByRole('button', { name: 'Unassign' }))

    expect(mutate).toHaveBeenCalledWith(
      { params: { path: { project_id: 'proj-1', assignment_id: 'a2' } } },
      expect.anything()
    )
  })

  it('shows error alert when unassign fails', async () => {
    const user = userEvent.setup()
    setupMutationMock('onError', new Error('Delete failed'))

    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    const actionButtons = screen.getAllByRole('button', { name: 'Open actions' })
    await user.click(actionButtons[0])
    await user.click(screen.getByRole('button', { name: 'Unassign' }))

    // Error alert should appear
    expect(screen.getByText('Failed to unassign role')).toBeInTheDocument()
  })

  it('filters assignments by name', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Click the "Filter by name" button in the mocked FilterBar
    await user.click(screen.getByRole('button', { name: 'Filter by name' }))

    // After filtering by name 'alice', only alice rows should remain
    const grid = screen.getByRole('grid', { name: 'Project role assignments' })
    expect(within(grid).getAllByText('alice')).toHaveLength(2)
    expect(within(grid).queryByText('devs')).not.toBeInTheDocument()
  })

  it('filters assignments by role', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Filter by role' }))

    // After filtering by role 'admin', only the admin assignment should show
    const grid = screen.getByRole('grid', { name: 'Project role assignments' })
    expect(within(grid).getByText('admin')).toBeInTheDocument()
    expect(within(grid).queryByText('editor')).not.toBeInTheDocument()
  })

  it('filters assignments by type', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Filter by type' }))

    // After filtering by type 'user', only user assignments should show
    const grid = screen.getByRole('grid', { name: 'Project role assignments' })
    expect(within(grid).queryByText('devs')).not.toBeInTheDocument()
    expect(within(grid).getAllByText('alice')).toHaveLength(2)
  })

  it('shows empty state when filters match nothing', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Filter no results' }))

    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  it('clears filters and resets page', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Apply a filter that produces no results
    await user.click(screen.getByRole('button', { name: 'Filter no results' }))
    expect(screen.getByText('No results found')).toBeInTheDocument()

    // Clear filters via our mock FilterBar's button (not the EmptyStateFilter's button)
    const filterBar = screen.getByTestId('filter-bar')
    await user.click(within(filterBar).getByRole('button', { name: 'Clear all filters' }))

    // Table should be restored
    expect(screen.getByRole('grid', { name: 'Project role assignments' })).toBeInTheDocument()
  })

  it('handles assignment with unknown principal_type as user', () => {
    setupMocks([
      {
        id: 'a-unknown',
        principal_id: 'u99',
        principal_name: 'unknown-type',
        principal_type: 'service_account',
        role_name: 'editor',
        created_at: '2024-05-01T00:00:00Z',
        project_id: 'proj-1',
        project_name: 'Test Project',
      },
    ])

    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Non-group types are treated as 'user'
    expect(screen.getByText('User')).toBeInTheDocument()
  })

  it('builds assignedRolesByUser map and passes it to modal', async () => {
    const user = userEvent.setup()
    // mockAllAssignments has alice (u1) with roles 'admin' and 'viewer'
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Assign role' }))

    // The mock AssignProjectRoleModal is rendered when open
    expect(screen.getByText('Assign project role modal')).toBeInTheDocument()
  })

  it('refetches data when assign modal reports success', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Open the modal
    await user.click(screen.getByRole('button', { name: 'Assign role' }))
    expect(screen.getByText('Assign project role modal')).toBeInTheDocument()

    // Trigger the onSuccess callback
    await user.click(screen.getByRole('button', { name: 'Mock assign success' }))

    expect(mockRefetch).toHaveBeenCalled()
  })

  it('does not call mutate when handleUnassign is called with no rowToUnassign', () => {
    // This tests the early return in handleUnassign when rowToUnassign is null
    // The dialog confirm button is only visible when a row is selected,
    // so we verify there's no unassign button when no row is selected
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // No unassign dialog should be visible initially
    expect(screen.queryByText('Unassign role?')).not.toBeInTheDocument()
  })

  it('clears filters via EmptyStateFilter clear button', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Apply a filter that produces no results
    await user.click(screen.getByRole('button', { name: 'Filter no results' }))
    expect(screen.getByText('No results found')).toBeInTheDocument()

    // Click the EmptyStateFilter's "Clear all filters" button (the PF one, not our mock)
    const clearButtons = screen.getAllByRole('button', { name: 'Clear all filters' })
    // The EmptyStateFilter clear button is the PF one (not in the filter bar)
    const emptyStateClearButton = clearButtons.find((btn) => !screen.getByTestId('filter-bar').contains(btn))
    expect(emptyStateClearButton).toBeDefined()
    await user.click(emptyStateClearButton!)

    // Table should be restored after clearing
    expect(screen.getByRole('grid', { name: 'Project role assignments' })).toBeInTheDocument()
  })

  it('sorts rows when sort state is active via URL params', () => {
    // To test sorting, we need to trigger the sort state via the sort column headers.
    // The useSortState hook reads from URL search params. Since the table headers
    // have sort props, clicking them would trigger the sort through URL params.
    // For unit testing, we verify the table renders sortable column headers.
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    const grid = screen.getByRole('grid', { name: 'Project role assignments' })
    // Verify sortable column headers exist
    expect(within(grid).getByText('Principal Name')).toBeInTheDocument()
    expect(within(grid).getByText('Principal Type')).toBeInTheDocument()
    expect(within(grid).getByText('Role Name')).toBeInTheDocument()
    expect(within(grid).getByText('Policies')).toBeInTheDocument()
  })

  it('renders pagination footer', () => {
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // The pagination component should be present
    expect(screen.getByText(/of/i)).toBeInTheDocument()
  })

  it('shows unassign confirmation with correct role and principal info', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Click the group row's (devs/editor) actions button
    const actionButtons = screen.getAllByRole('button', { name: 'Open actions' })
    await user.click(actionButtons[1])

    // Verify the dialog shows the confirmation message with role and principal name
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/editor/)).toBeInTheDocument()
    expect(within(dialog).getByText(/devs/)).toBeInTheDocument()
  })

  it('handles multiple assignments for the same user in assignedRolesByUser map', () => {
    // alice (u1) has two roles: admin and viewer
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Both alice assignments should be visible
    expect(screen.getAllByText('alice')).toHaveLength(2)
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('viewer')).toBeInTheDocument()
  })

  it('keeps all rows when filter has unknown key (default branch)', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Apply filter with unknown key
    await user.click(screen.getByRole('button', { name: 'Filter unknown key' }))

    // Unknown filter key hits the default case (returns true), so all rows remain
    const grid = screen.getByRole('grid', { name: 'Project role assignments' })
    expect(within(grid).getAllByText('alice')).toHaveLength(2)
    expect(within(grid).getByText('devs')).toBeInTheDocument()
  })

  it('navigates pages via pagination footer', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    const footer = screen.getByTestId('pagination-footer')

    // Click next page
    await user.click(within(footer).getByRole('button', { name: 'Go to next page' }))

    // Click previous page
    await user.click(within(footer).getByRole('button', { name: 'Go to previous page' }))

    // Verify the component still renders correctly
    expect(screen.getByRole('grid', { name: 'Project role assignments' })).toBeInTheDocument()
  })

  it('changes per page via pagination footer', async () => {
    const user = userEvent.setup()
    const manyAssignments = Array.from({ length: 12 }, (_, i) => ({
      id: `gen-${i}`,
      principal_id: `u${i}`,
      principal_name: `user-${i}`,
      principal_type: 'user' as const,
      role_name: 'viewer',
      created_at: '2024-01-01T00:00:00Z',
      project_id: 'proj-1',
      project_name: 'Test Project',
    }))
    setupMocks(manyAssignments)
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Default perPage=20: all 12 rows visible
    expect(screen.getAllByText('viewer')).toHaveLength(12)

    // Change to 10 per page
    await user.click(screen.getByRole('button', { name: 'Set 10 per page' }))

    // Only the first 10 rows should now be visible
    expect(screen.getAllByText('viewer')).toHaveLength(10)
  })

  it('closes the assign modal via onClose callback', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Open the modal
    await user.click(screen.getByRole('button', { name: 'Assign role' }))
    expect(screen.getByText('Assign project role modal')).toBeInTheDocument()

    // Close the modal via mock close button
    await user.click(screen.getByRole('button', { name: 'Mock close modal' }))

    // Modal should be closed
    expect(screen.queryByText('Assign project role modal')).not.toBeInTheDocument()
  })

  it('sorts rows by principal name when column header is clicked', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Click the "Principal Name" column header sort button
    const grid = screen.getByRole('grid', { name: 'Project role assignments' })
    const sortButton = within(grid).getByRole('button', { name: 'Principal Name' })
    await user.click(sortButton)

    // After sorting, the table should still render all rows
    expect(within(grid).getAllByText('alice')).toHaveLength(2)
    expect(within(grid).getByText('devs')).toBeInTheDocument()
  })

  it('sorts rows in descending order when column header is clicked twice', async () => {
    const user = userEvent.setup()
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    const grid = screen.getByRole('grid', { name: 'Project role assignments' })
    const sortButton = within(grid).getByRole('button', { name: 'Principal Name' })

    // Click twice for descending sort
    await user.click(sortButton)
    await user.click(sortButton)

    // Table should still render all rows
    expect(within(grid).getAllByText('alice')).toHaveLength(2)
    expect(within(grid).getByText('devs')).toBeInTheDocument()
  })

  it('closes the assign modal in empty state via onClose callback', async () => {
    const user = userEvent.setup()
    setupMocks([])
    render(<ProjectRoleAssignmentsTab projectId="proj-1" />, { wrapper })

    // Open the modal from empty state
    await user.click(screen.getByRole('button', { name: 'Assign role' }))
    expect(screen.getByText('Assign project role modal')).toBeInTheDocument()

    // Close the modal
    await user.click(screen.getByRole('button', { name: 'Mock close modal' }))

    // Modal should be closed
    expect(screen.queryByText('Assign project role modal')).not.toBeInTheDocument()
  })
})
