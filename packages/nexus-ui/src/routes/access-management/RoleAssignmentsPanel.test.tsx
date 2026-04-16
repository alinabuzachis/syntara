import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../components/alerts'
import { accessClient } from '../access/accessClient'
import { useAllRoles } from '../access/useAllRoles'

import { RoleAssignmentsPanel } from './RoleAssignmentsPanel'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../access/useAllPolicies', () => ({
  useAllPolicies: vi.fn().mockReturnValue({ policies: [], isLoading: false, error: null }),
}))

vi.mock('../access/useAllRoles', () => ({
  useAllRoles: vi.fn().mockReturnValue({ roles: [], isLoading: false, error: null }),
}))

const mockDeleteUserAssignment = vi.fn()
const mockDeleteGroupAssignment = vi.fn()

const mockMutationReturn = (mutateFn: ReturnType<typeof vi.fn>) =>
  ({
    mutate: mutateFn,
    mutateAsync: vi.fn(),
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
  }) as never

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

// ── Test Data ────────────────────────────────────────────────────────────────

const mockUserAssignments = [
  { id: 'ua1', user_id: 'u1', role_name: 'admin-role', created_at: '2024-01-01T00:00:00Z' },
  { id: 'ua2', user_id: 'u1', role_name: 'viewer-role', created_at: '2024-01-02T00:00:00Z' },
  { id: 'ua3', user_id: 'u2', role_name: 'admin-role', created_at: '2024-01-03T00:00:00Z' }, // different user
]

const mockGroupAssignments = [
  { id: 'ga1', group_id: 'g1', role_name: 'admin-role', created_at: '2024-01-01T00:00:00Z' },
  { id: 'ga2', group_id: 'g2', role_name: 'viewer-role', created_at: '2024-01-02T00:00:00Z' }, // different group
]

const mockRoles = {
  resources: [
    { id: 'r1', name: 'admin-role', description: 'Full access', project_id: null, policies: ['policy-a', 'policy-b'] },
    { id: 'r2', name: 'viewer-role', description: 'Read-only', project_id: null, policies: ['policy-c'] },
  ],
}

const mockPolicies = {
  resources: [
    { name: 'policy-a', description: 'Policy A desc' },
    { name: 'policy-b', description: 'Policy B desc' },
    { name: 'policy-c', description: 'Policy C desc' },
  ],
}

const mockProjects = [
  {
    id: 'proj1',
    name: 'Project Alpha',
    description: null,
    labels: {},
    is_default: false,
    created_at: null,
    updated_at: null,
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupMocks(overrides?: {
  userAssignments?: typeof mockUserAssignments
  groupAssignments?: typeof mockGroupAssignments
}) {
  const mockRefetch = vi.fn().mockResolvedValue({})

  vi.mocked(useAllRoles).mockReturnValue({
    roles: mockRoles.resources,
    isLoading: false,
    error: null,
  })

  vi.mocked(accessClient.useQuery).mockImplementation((_method: string, path: string) => {
    if (path === '/user-role-assignments') {
      return {
        data: overrides?.userAssignments ?? mockUserAssignments,
        isPending: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never
    }
    if (path === '/group-role-assignments') {
      return {
        data: overrides?.groupAssignments ?? mockGroupAssignments,
        isPending: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never
    }
    if (path === '/policies') {
      return { data: mockPolicies, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
    }
    if (path === '/projects') {
      return { data: mockProjects, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
    }
    return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
  })

  vi.mocked(accessClient.useMutation).mockImplementation((_method: string, path: string) => {
    if (path === '/user-role-assignments/{assignment_id}') {
      return mockMutationReturn(mockDeleteUserAssignment)
    }
    if (path === '/group-role-assignments/{assignment_id}') {
      return mockMutationReturn(mockDeleteGroupAssignment)
    }
    // Assign mutations (used by child AssignRoleModal)
    return mockMutationReturn(vi.fn())
  })

  return { mockRefetch }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RoleAssignmentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  describe('Accessibility', () => {
    it('has no accessibility violations with data', async () => {
      const { container } = render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in empty state', async () => {
      setupMocks({ userAssignments: [] })
      const { container } = render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('Loading and error states', () => {
    it('renders loading state when query is pending', () => {
      vi.mocked(accessClient.useQuery).mockImplementation((_method: string, path: string) => {
        if (path === '/user-role-assignments') {
          return { data: undefined, isPending: true, isError: false, error: null, refetch: vi.fn() } as never
        }
        if (path === '/group-role-assignments') {
          return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        if (path === '/roles') {
          return { data: { resources: [] }, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        if (path === '/projects') {
          return { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
      })
      vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn(vi.fn()))

      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })
      expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    })

    it('renders error state when query fails', () => {
      vi.mocked(accessClient.useQuery).mockImplementation((_method: string, path: string) => {
        if (path === '/user-role-assignments') {
          return {
            data: undefined,
            isPending: false,
            isError: true,
            error: new Error('Server error'),
            refetch: vi.fn(),
          } as never
        }
        if (path === '/group-role-assignments') {
          return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        if (path === '/roles') {
          return { data: { resources: [] }, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        if (path === '/projects') {
          return { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
      })
      vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn(vi.fn()))

      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })
      expect(screen.getByText('Error loading role assignments')).toBeInTheDocument()
    })
  })

  describe('Empty state', () => {
    it('shows empty state when user has no assignments', () => {
      setupMocks({ userAssignments: [] })
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      expect(screen.getByText('No role assignments')).toBeInTheDocument()
      expect(screen.getByText('No roles have been assigned to this user.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Assign role' })).toBeInTheDocument()
    })

    it('shows empty state when group has no assignments', () => {
      setupMocks({ groupAssignments: [] })
      render(<RoleAssignmentsPanel principalType="group" principalId="g1" />, { wrapper })

      expect(screen.getByText('No role assignments')).toBeInTheDocument()
      expect(screen.getByText('No roles have been assigned to this group.')).toBeInTheDocument()
    })

    it('shows empty state for user with no matching assignments (filtered by principalId)', () => {
      // u99 does not appear in mockUserAssignments
      render(<RoleAssignmentsPanel principalType="user" principalId="u99" />, { wrapper })

      expect(screen.getByText('No role assignments')).toBeInTheDocument()
    })

    it('opens assign role modal from empty state', async () => {
      const user = userEvent.setup()
      setupMocks({ userAssignments: [] })
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Assign role' }))

      await waitFor(() => {
        expect(screen.getByText('Assign roles')).toBeInTheDocument()
      })
    })

    it('closes assign role modal from empty state via Cancel', async () => {
      const user = userEvent.setup()
      setupMocks({ userAssignments: [] })
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Assign role' }))

      await waitFor(() => {
        expect(screen.getByText('Assign roles')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByText('Assign roles')).not.toBeInTheDocument()
      })
    })
  })

  describe('Table rendering (user)', () => {
    it('renders table with correct columns', () => {
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const table = screen.getByRole('grid', { name: 'Role assignments table' })
      expect(table).toBeInTheDocument()

      expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Scope' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Policies' })).toBeInTheDocument()
    })

    it('renders rows filtered by principalId', () => {
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const table = screen.getByRole('grid', { name: 'Role assignments table' })
      const rows = within(table).getAllByRole('row')

      // Header row + 2 data rows (ua1 and ua2 belong to u1, ua3 belongs to u2)
      expect(rows).toHaveLength(3)

      expect(screen.getByText('admin-role')).toBeInTheDocument()
      expect(screen.getByText('viewer-role')).toBeInTheDocument()
    })

    it('shows role description', () => {
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })
      expect(screen.getByText('Full access')).toBeInTheDocument()
      expect(screen.getByText('Read-only')).toBeInTheDocument()
    })

    it('shows scope as System labels', () => {
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const systemLabels = screen.getAllByText('System')
      // All assignments are system-scoped
      expect(systemLabels.length).toBeGreaterThanOrEqual(2)
    })

    it('shows policies as labels', () => {
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      expect(screen.getByText('policy-a')).toBeInTheDocument()
      expect(screen.getByText('policy-b')).toBeInTheDocument()
      expect(screen.getByText('policy-c')).toBeInTheDocument()
    })

    it('shows "Assign role" button', () => {
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })
      expect(screen.getByRole('button', { name: 'Assign role' })).toBeInTheDocument()
    })
  })

  describe('Table rendering (group)', () => {
    it('renders group assignments filtered by principalId', () => {
      render(<RoleAssignmentsPanel principalType="group" principalId="g1" />, { wrapper })

      const table = screen.getByRole('grid', { name: 'Role assignments table' })
      const rows = within(table).getAllByRole('row')

      // Header + 1 data row (ga1 belongs to g1; ga2 belongs to g2)
      expect(rows).toHaveLength(2)
      expect(screen.getByText('admin-role')).toBeInTheDocument()
    })
  })

  describe('Role without description or policies', () => {
    it('shows dash for missing description', () => {
      // Override roles to have one without description
      vi.mocked(useAllRoles).mockReturnValue({
        roles: [{ id: 'rx', name: 'no-desc-role', description: null, project_id: null, policies: [] }] as never,
        isLoading: false,
        error: null,
      })

      vi.mocked(accessClient.useQuery).mockImplementation((_method: string, path: string) => {
        if (path === '/user-role-assignments') {
          return {
            data: [{ id: 'ua1', user_id: 'u1', role_name: 'no-desc-role', created_at: null }],
            isPending: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          } as never
        }
        if (path === '/group-role-assignments') {
          return { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        if (path === '/policies') {
          return { data: { resources: [] }, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        if (path === '/projects') {
          return { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
      })

      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      // Description column shows dash, policies column also shows dash
      const dashes = screen.getAllByText('-')
      expect(dashes.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Filtering', () => {
    it('renders the filter bar', () => {
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })
      expect(screen.getByPlaceholderText('Filter by name')).toBeInTheDocument()
    })

    it('filters rows by name', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const filterInput = screen.getByPlaceholderText('Filter by name')
      await user.type(filterInput, 'admin')
      // Press Enter or trigger filter application
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByText('admin-role')).toBeInTheDocument()
        expect(screen.queryByText('viewer-role')).not.toBeInTheDocument()
      })
    })

    it('shows filter empty state when no rows match filter', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const filterInput = screen.getByPlaceholderText('Filter by name')
      await user.type(filterInput, 'nonexistent')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument()
      })
    })

    it('clears filters from the filter empty state', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const filterInput = screen.getByPlaceholderText('Filter by name')
      await user.type(filterInput, 'nonexistent')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument()
      })

      // Click "Clear all filters" from the empty state
      const clearButtons = screen.getAllByRole('button', { name: /Clear all filters/i })
      await user.click(clearButtons[clearButtons.length - 1])

      // After clearing, both roles should be visible again
      await waitFor(() => {
        expect(screen.getByText('admin-role')).toBeInTheDocument()
        expect(screen.getByText('viewer-role')).toBeInTheDocument()
      })
    })

    it('clears filters from the FilterBar clear-all button', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const filterInput = screen.getByPlaceholderText('Filter by name')
      await user.type(filterInput, 'admin')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByText('admin-role')).toBeInTheDocument()
        expect(screen.queryByText('viewer-role')).not.toBeInTheDocument()
      })

      // Click "Clear all filters" from the FilterBar (first clear button)
      const clearButtons = screen.getAllByRole('button', { name: /Clear all filters/i })
      await user.click(clearButtons[0])

      // After clearing, both roles should be visible again
      await waitFor(() => {
        expect(screen.getByText('admin-role')).toBeInTheDocument()
        expect(screen.getByText('viewer-role')).toBeInTheDocument()
      })
    })
  })

  describe('Pagination', () => {
    it('renders pagination footer', () => {
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      // PF6 Pagination renders a nav element
      expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
    })

    it('paginates rows and supports next/prev navigation', async () => {
      // Create many assignments to exceed default perPage (20)
      const manyAssignments = Array.from({ length: 25 }, (_, i) => ({
        id: `ua-${String(i)}`,
        user_id: 'u1',
        role_name: `role-${String(i)}`,
        created_at: '2024-01-01T00:00:00Z',
      }))

      // Create matching roles
      const manyRoles = Array.from({ length: 25 }, (_, i) => ({
        id: `r-${String(i)}`,
        name: `role-${String(i)}`,
        description: null,
        project_id: null,
        policies: [],
      }))

      const mockRefetch = vi.fn().mockResolvedValue({})

      vi.mocked(useAllRoles).mockReturnValue({
        roles: manyRoles as never,
        isLoading: false,
        error: null,
      })

      vi.mocked(accessClient.useQuery).mockImplementation((_method: string, path: string) => {
        if (path === '/user-role-assignments') {
          return { data: manyAssignments, isPending: false, isError: false, error: null, refetch: mockRefetch } as never
        }
        if (path === '/group-role-assignments') {
          return { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        if (path === '/policies') {
          return { data: { resources: [] }, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        if (path === '/projects') {
          return { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() } as never
        }
        return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as never
      })

      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      // Page 1 shows first 20 rows
      expect(screen.getByText('role-0')).toBeInTheDocument()
      expect(screen.getByText('role-19')).toBeInTheDocument()
      expect(screen.queryByText('role-20')).not.toBeInTheDocument()

      // Click next page button
      const nextButton = screen.getByRole('button', { name: /go to next page/i })
      await user.click(nextButton)

      // Page 2 should show remaining rows
      await waitFor(() => {
        expect(screen.getByText('role-20')).toBeInTheDocument()
      })
      expect(screen.queryByText('role-0')).not.toBeInTheDocument()

      // Click prev page button
      const prevButton = screen.getByRole('button', { name: /go to previous page/i })
      await user.click(prevButton)

      await waitFor(() => {
        expect(screen.getByText('role-0')).toBeInTheDocument()
      })
    })
  })

  describe('Assign role modal', () => {
    it('opens assign role modal when "Assign role" button is clicked', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Assign role' }))

      await waitFor(() => {
        expect(screen.getByText('Assign roles')).toBeInTheDocument()
      })
    })

    it('closes assign role modal when Cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Assign role' }))

      await waitFor(() => {
        expect(screen.getByText('Assign roles')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByText('Assign roles')).not.toBeInTheDocument()
      })
    })
  })

  describe('Unassign role', () => {
    it('opens unassign dialog when Unassign action is clicked', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      // Click kebab menu on first row
      const kebabButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(kebabButtons[0])

      // Click Unassign action
      const unassignItem = await screen.findByRole('menuitem', { name: /Unassign/i })
      await user.click(unassignItem)

      // Dialog should appear
      await waitFor(() => {
        expect(screen.getByText('Unassign role')).toBeInTheDocument()
        expect(screen.getByText(/Are you sure you want to unassign role/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Unassign' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      })
    })

    it('closes unassign dialog when Cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const kebabButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(kebabButtons[0])

      const unassignItem = await screen.findByRole('menuitem', { name: /Unassign/i })
      await user.click(unassignItem)

      await waitFor(() => {
        expect(screen.getByText('Unassign role')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByText('Unassign role')).not.toBeInTheDocument()
      })
    })

    it('calls deleteUserAssignment when confirming unassign for user', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const kebabButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(kebabButtons[0])

      const unassignItem = await screen.findByRole('menuitem', { name: /Unassign/i })
      await user.click(unassignItem)

      await waitFor(() => {
        expect(screen.getByText('Unassign role')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Unassign' }))

      await waitFor(() => {
        expect(mockDeleteUserAssignment).toHaveBeenCalledWith(
          { params: { path: { assignment_id: 'ua1' } } },
          expect.objectContaining({
            onSuccess: expect.any(Function) as unknown,
            onError: expect.any(Function) as unknown,
            onSettled: expect.any(Function) as unknown,
          })
        )
      })
    })

    it('calls deleteGroupAssignment when confirming unassign for group', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="group" principalId="g1" />, { wrapper })

      const kebabButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(kebabButtons[0])

      const unassignItem = await screen.findByRole('menuitem', { name: /Unassign/i })
      await user.click(unassignItem)

      await waitFor(() => {
        expect(screen.getByText('Unassign role')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Unassign' }))

      await waitFor(() => {
        expect(mockDeleteGroupAssignment).toHaveBeenCalledWith(
          { params: { path: { assignment_id: 'ga1' } } },
          expect.objectContaining({
            onSuccess: expect.any(Function) as unknown,
            onError: expect.any(Function) as unknown,
            onSettled: expect.any(Function) as unknown,
          })
        )
      })
    })

    it('shows success alert after successful unassign', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const kebabButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(kebabButtons[0])

      const unassignItem = await screen.findByRole('menuitem', { name: /Unassign/i })
      await user.click(unassignItem)

      await waitFor(() => {
        expect(screen.getByText('Unassign role')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Unassign' }))

      // Invoke the onSuccess callback
      await waitFor(() => {
        expect(mockDeleteUserAssignment).toHaveBeenCalled()
      })

      const callbacks = mockDeleteUserAssignment.mock.calls[0][1] as {
        onSuccess: () => void
        onSettled: () => void
      }

      await waitFor(() => {
        callbacks.onSuccess()
      })

      expect(screen.getByText('Role unassigned')).toBeInTheDocument()
    })

    it('shows error alert after failed unassign', async () => {
      const user = userEvent.setup()
      render(<RoleAssignmentsPanel principalType="user" principalId="u1" />, { wrapper })

      const kebabButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(kebabButtons[0])

      const unassignItem = await screen.findByRole('menuitem', { name: /Unassign/i })
      await user.click(unassignItem)

      await waitFor(() => {
        expect(screen.getByText('Unassign role')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Unassign' }))

      await waitFor(() => {
        expect(mockDeleteUserAssignment).toHaveBeenCalled()
      })

      const callbacks = mockDeleteUserAssignment.mock.calls[0][1] as {
        onError: (err: unknown) => void
        onSettled: () => void
      }

      await waitFor(() => {
        callbacks.onError(new Error('Server error'))
      })

      expect(screen.getByText('Failed to unassign role')).toBeInTheDocument()
    })
  })
})
