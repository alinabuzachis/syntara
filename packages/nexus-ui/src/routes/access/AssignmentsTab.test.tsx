import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../providers/alerts'
import type { FilterConfig } from '../../types/filters'

import { AssignmentsTab } from './AssignmentsTab'
import type { PermissionRow } from './types'
import { useAssignmentsData } from './useAssignmentsData'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockHandleFilterChange = vi.fn()
const mockGetSortParams = vi.fn().mockReturnValue({
  sortBy: { index: undefined, direction: 'asc', defaultDirection: 'asc' as const },
  onSort: vi.fn(),
  columnIndex: 0,
})
const mockRefetchAll = vi.fn()
const mockHandleDelete = vi.fn()

const mockClearAllFilters = vi.fn()

const defaultHookReturn: ReturnType<typeof useAssignmentsData> = {
  filters: [] as FilterConfig[],
  handleFilterChange: mockHandleFilterChange,
  clearAllFilters: mockClearAllFilters,
  getSortParams: mockGetSortParams,
  projects: [
    {
      id: 'p1',
      name: 'Project Alpha',
      description: null,
      labels: {},
      is_default: true,
    },
  ],
  projectNameMap: new Map([['p1', 'Project Alpha']]),
  allRows: [] as PermissionRow[],
  sortedRows: [] as PermissionRow[],
  hasActiveFilters: false,
  refetchAll: mockRefetchAll,
  handleDelete: mockHandleDelete,
}

vi.mock('./useAssignmentsData', () => ({
  useAssignmentsData: vi.fn(() => defaultHookReturn),
}))

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: vi.fn().mockImplementation((_method: string, path: string) => {
      if (path === '/projects') {
        return {
          data: [{ id: 'p1', name: 'Project Alpha' }],
          isPending: false,
          isError: false,
          error: null,
          isFetching: false,
          refetch: vi.fn(),
        }
      }
      if (path === '/roles') {
        return {
          data: {
            resources: [
              { id: 'r1', name: 'Admin' },
              { id: 'r2', name: 'Viewer' },
            ],
          },
          isPending: false,
          isError: false,
          error: null,
          isFetching: false,
          refetch: vi.fn(),
        }
      }
      return { data: undefined, isPending: false, isError: false, error: null, isFetching: false, refetch: vi.fn() }
    }),
    useMutation: vi.fn().mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({}),
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
    }),
  },
  accessFetchClient: {
    GET: vi.fn().mockResolvedValue({ data: { resources: [] }, error: null }),
    use: vi.fn(),
  },
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

// ── Test data ────────────────────────────────────────────────────────────────

const sampleRows: PermissionRow[] = [
  {
    id: 'pr1',
    principalType: 'user',
    principalId: 'u1',
    principalName: 'alice',
    assignmentType: 'role',
    assignmentName: 'Admin',
    scopeType: 'project',
    scopeName: 'Project Alpha',
    projectId: 'p1',
    roleDescription: null,
    rolePolicies: [],
    sourceEndpoint: 'project-role-assignments',
  },
  {
    id: 'pgr1',
    principalType: 'group',
    principalId: 'g1',
    principalName: 'Devs',
    assignmentType: 'role',
    assignmentName: 'Editor',
    scopeType: 'project',
    scopeName: 'Project Alpha',
    projectId: 'p1',
    roleDescription: null,
    rolePolicies: [],
    sourceEndpoint: 'project-role-assignments',
  },
  {
    id: 'sur1',
    principalType: 'user',
    principalId: 'u2',
    principalName: 'bob',
    assignmentType: 'role',
    assignmentName: 'Viewer',
    scopeType: 'system',
    scopeName: 'System',
    roleDescription: null,
    rolePolicies: [],
    sourceEndpoint: 'role-assignments',
  },
]

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AssignmentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAssignmentsData).mockReturnValue({ ...defaultHookReturn })
  })

  describe('Empty State', () => {
    it('shows empty state when no rows and no active filters', () => {
      render(<AssignmentsTab />, { wrapper })

      expect(screen.getByText('No assignments found')).toBeInTheDocument()
      expect(screen.getByText('Assign roles to users or groups to grant access.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add assignment' })).toBeInTheDocument()
    })

    it('renders Add assignment button in empty state', async () => {
      const user = userEvent.setup()
      render(<AssignmentsTab />, { wrapper })

      const addButton = screen.getByRole('button', { name: 'Add assignment' })
      expect(addButton).toBeInTheDocument()
      // Clicking the button sets isAddDialogOpen, but the early return in
      // the component prevents the dialog from rendering when allRows is empty.
      // This verifies the button is present and clickable.
      await user.click(addButton)
    })
  })

  describe('Table Rendering', () => {
    beforeEach(() => {
      vi.mocked(useAssignmentsData).mockReturnValue({
        ...defaultHookReturn,
        allRows: sampleRows,
        sortedRows: sampleRows,
      })
    })

    it('renders table with data rows', () => {
      render(<AssignmentsTab />, { wrapper })

      expect(screen.getByRole('grid', { name: 'Role assignments' })).toBeInTheDocument()
      expect(screen.getByText('alice')).toBeInTheDocument()
      expect(screen.getByText('Devs')).toBeInTheDocument()
      expect(screen.getByText('bob')).toBeInTheDocument()
    })

    it('renders column headers', () => {
      render(<AssignmentsTab />, { wrapper })

      expect(screen.getByRole('columnheader', { name: /Principal Name/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Principal Type/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Role Name/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Scope/i })).toBeInTheDocument()
    })

    it('renders User label for user principal type', () => {
      render(<AssignmentsTab />, { wrapper })

      const table = screen.getByRole('grid', { name: 'Role assignments' })
      const rows = within(table).getAllByRole('row')
      // Row 1 is alice (user)
      expect(within(rows[1]).getByText('User')).toBeInTheDocument()
    })

    it('renders Group label for group principal type', () => {
      render(<AssignmentsTab />, { wrapper })

      const table = screen.getByRole('grid', { name: 'Role assignments' })
      const rows = within(table).getAllByRole('row')
      // Row 2 is Devs (group)
      expect(within(rows[2]).getByText('Group')).toBeInTheDocument()
    })

    it('renders role names as labels', () => {
      render(<AssignmentsTab />, { wrapper })

      expect(screen.getByText('Admin')).toBeInTheDocument()
      expect(screen.getByText('Editor')).toBeInTheDocument()
      expect(screen.getByText('Viewer')).toBeInTheDocument()
    })

    it('renders project name for project-scoped rows', () => {
      render(<AssignmentsTab />, { wrapper })

      const projectLabels = screen.getAllByText('Project Alpha')
      expect(projectLabels.length).toBeGreaterThanOrEqual(1)
    })

    it('renders System label for system-scoped rows', () => {
      render(<AssignmentsTab />, { wrapper })

      const table = screen.getByRole('grid', { name: 'Role assignments' })
      const rows = within(table).getAllByRole('row')
      // Row 3 is bob (system-scoped) — scope column should show 'System' label
      expect(within(rows[3]).getByText('System')).toBeInTheDocument()
    })

    it('renders Add assignment button', () => {
      render(<AssignmentsTab />, { wrapper })

      expect(screen.getByRole('button', { name: /Add assignment/i })).toBeInTheDocument()
    })
  })

  describe('Filter Empty State', () => {
    it('shows filter empty state when filters active but no matching rows', () => {
      vi.mocked(useAssignmentsData).mockReturnValue({
        ...defaultHookReturn,
        allRows: sampleRows,
        sortedRows: [],
        hasActiveFilters: true,
        filters: [{ key: 'name', value: 'nonexistent' }],
      })

      render(<AssignmentsTab />, { wrapper })

      expect(screen.getByText('No results found')).toBeInTheDocument()
    })

    it('clears all filters from filter empty state', async () => {
      const user = userEvent.setup()
      vi.mocked(useAssignmentsData).mockReturnValue({
        ...defaultHookReturn,
        allRows: sampleRows,
        sortedRows: [],
        hasActiveFilters: true,
        filters: [{ key: 'name', value: 'nonexistent' }],
      })

      render(<AssignmentsTab />, { wrapper })

      // There may be multiple "Clear all filters" buttons (FilterBar + EmptyStateFilter)
      const clearButtons = screen.getAllByRole('button', { name: /Clear all filters/i })
      await user.click(clearButtons[clearButtons.length - 1])

      expect(mockClearAllFilters).toHaveBeenCalled()
    })
  })

  describe('Row Actions', () => {
    beforeEach(() => {
      vi.mocked(useAssignmentsData).mockReturnValue({
        ...defaultHookReturn,
        allRows: sampleRows,
        sortedRows: sampleRows,
      })
    })

    it('opens edit dialog when Edit action is clicked', async () => {
      const user = userEvent.setup()
      render(<AssignmentsTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const editOption = await screen.findByRole('menuitem', { name: /Edit assignment/i })
      await user.click(editOption)

      await waitFor(() => {
        expect(screen.getByText('Edit Assignment')).toBeInTheDocument()
      })
    })

    it('opens delete dialog when Delete action is clicked', async () => {
      const user = userEvent.setup()
      render(<AssignmentsTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const deleteOption = await screen.findByRole('menuitem', { name: /Delete assignment/i })
      await user.click(deleteOption)

      await waitFor(() => {
        expect(screen.getByText('Remove assignment?')).toBeInTheDocument()
      })
    })
  })

  describe('Delete Confirmation Modal', () => {
    beforeEach(() => {
      vi.mocked(useAssignmentsData).mockReturnValue({
        ...defaultHookReturn,
        allRows: sampleRows,
        sortedRows: sampleRows,
      })
    })

    it('shows the delete modal with Remove and Cancel buttons', async () => {
      const user = userEvent.setup()
      render(<AssignmentsTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const deleteOption = await screen.findByRole('menuitem', { name: /Delete assignment/i })
      await user.click(deleteOption)

      await waitFor(() => {
        expect(screen.getByText('Remove assignment?')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      })
    })

    it('shows revoke message in delete modal body', async () => {
      const user = userEvent.setup()
      render(<AssignmentsTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const deleteOption = await screen.findByRole('menuitem', { name: /Delete assignment/i })
      await user.click(deleteOption)

      await waitFor(() => {
        expect(screen.getByText(/This will revoke the associated permissions/)).toBeInTheDocument()
      })
    })

    it('calls handleDelete when Remove button is clicked', async () => {
      const user = userEvent.setup()
      render(<AssignmentsTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const deleteOption = await screen.findByRole('menuitem', { name: /Delete assignment/i })
      await user.click(deleteOption)

      const removeButton = await screen.findByRole('button', { name: 'Remove' })
      await user.click(removeButton)

      expect(mockHandleDelete).toHaveBeenCalledWith(sampleRows[0], expect.any(Function))
    })

    it('closes delete modal when Cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<AssignmentsTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const deleteOption = await screen.findByRole('menuitem', { name: /Delete assignment/i })
      await user.click(deleteOption)

      const dialog = await screen.findByRole('dialog', { name: /Remove assignment/i })

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Remove assignment/i })).not.toBeInTheDocument()
      })
    })
  })

  describe('Add Assignment Dialog', () => {
    beforeEach(() => {
      vi.mocked(useAssignmentsData).mockReturnValue({
        ...defaultHookReturn,
        allRows: sampleRows,
        sortedRows: sampleRows,
      })
    })

    it('opens add dialog when Add assignment button is clicked', async () => {
      const user = userEvent.setup()
      render(<AssignmentsTab />, { wrapper })

      await user.click(screen.getByRole('button', { name: /Add assignment/i }))

      await waitFor(() => {
        expect(screen.getByText('Add Assignment')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations with data', async () => {
      vi.mocked(useAssignmentsData).mockReturnValue({
        ...defaultHookReturn,
        allRows: sampleRows,
        sortedRows: sampleRows,
      })

      const { container } = render(<AssignmentsTab />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in empty state', async () => {
      const { container } = render(<AssignmentsTab />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
