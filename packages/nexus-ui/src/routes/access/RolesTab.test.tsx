import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../components/alerts'
import { useQueryState } from '../../components/states/useQueryState'

import { accessClient } from './accessClient'
import { RolesTab } from './RolesTab'
import type { RoleRead } from './types'

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  accessFetchClient: {
    GET: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}))

vi.mock('../../components/states/useQueryState', () => ({
  useQueryState: vi.fn(),
}))

vi.mock('wouter', async () => {
  const React = await import('react')
  return {
    useLocation: () => ['/access-management/roles', vi.fn()],
    useSearchParams: () => React.useState(new URLSearchParams()),
  }
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockRoles: RoleRead[] = [
  {
    id: 'role-1',
    name: 'admin',
    description: 'Full admin access',
    policies: ['admin-policy', 'read-all'],
    is_builtin: true,
    project_id: null,
    labels: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'role-2',
    name: 'custom-editor',
    description: 'Custom editor role',
    policies: ['workflow-edit'],
    is_builtin: false,
    project_id: null,
    labels: {},
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-02T00:00:00Z',
  },
  {
    id: 'role-3',
    name: 'viewer',
    description: null,
    policies: ['read-only'],
    is_builtin: false,
    project_id: null,
    labels: {},
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
  },
]

describe('RolesTab', () => {
  const mockRefetch = vi.fn().mockResolvedValue({})
  const mockDeleteMutate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Default: useQueryState returns null (success state)
    vi.mocked(useQueryState).mockReturnValue(null)

    vi.mocked(accessClient.useQuery).mockImplementation((_method: string, path: string) => {
      if (path === '/projects') {
        return {
          data: [],
          isPending: false,
          isError: false,
          error: null,
          isFetching: false,
          refetch: mockRefetch,
        } as never
      }
      return {
        data: { resources: mockRoles, next: null, total: 3 },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: mockRefetch,
      } as never
    })

    vi.mocked(accessClient.useMutation).mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
      isError: false,
      error: null,
      data: null,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      isIdle: true,
      isSuccess: false,
      failureCount: 0,
      failureReason: null,
      context: undefined,
      submittedAt: 0,
      variables: undefined,
      status: 'idle',
      isPaused: false,
    } as never)
  })

  describe('Accessibility', () => {
    it('has no accessibility violations with data', async () => {
      const { container } = render(<RolesTab />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in empty state', async () => {
      vi.mocked(accessClient.useQuery).mockReturnValue({
        data: { resources: [], next: null, total: 0 },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: mockRefetch,
      } as never)

      const { container } = render(<RolesTab />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('Rendering', () => {
    it('renders roles in table', () => {
      render(<RolesTab />, { wrapper })

      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('custom-editor')).toBeInTheDocument()
      expect(screen.getByText('viewer')).toBeInTheDocument()
    })

    it('renders role descriptions', () => {
      render(<RolesTab />, { wrapper })

      expect(screen.getByText('Full admin access')).toBeInTheDocument()
      expect(screen.getByText('Custom editor role')).toBeInTheDocument()
    })

    it('renders dash for null description', () => {
      render(<RolesTab />, { wrapper })

      const table = screen.getByRole('grid', { name: 'Roles' })
      const rows = within(table).getAllByRole('row')
      // viewer is row index 3 (header + 3 data rows, viewer is last)
      expect(within(rows[3]).getByText('-')).toBeInTheDocument()
    })

    it('renders policies as labels', () => {
      render(<RolesTab />, { wrapper })

      expect(screen.getByText('admin-policy')).toBeInTheDocument()
      expect(screen.getByText('read-all')).toBeInTheDocument()
      expect(screen.getByText('workflow-edit')).toBeInTheDocument()
    })

    it('renders Built-in label for builtin roles', () => {
      render(<RolesTab />, { wrapper })

      expect(screen.getByText('Built-in')).toBeInTheDocument()
    })

    it('renders Custom label for non-builtin roles', () => {
      render(<RolesTab />, { wrapper })

      const customLabels = screen.getAllByText('Custom')
      expect(customLabels.length).toBe(2)
    })

    it('renders Add role button', () => {
      render(<RolesTab />, { wrapper })

      expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument()
    })

    it('renders table column headers', () => {
      render(<RolesTab />, { wrapper })

      expect(screen.getByRole('columnheader', { name: /Name/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Description/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Policies/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Type/i })).toBeInTheDocument()
    })
  })

  describe('Empty state', () => {
    it('displays EmptyStateNoData when no roles and no filters', () => {
      vi.mocked(accessClient.useQuery).mockReturnValue({
        data: { resources: [], next: null, total: 0 },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: mockRefetch,
      } as never)

      render(<RolesTab />, { wrapper })

      expect(screen.getByText('No roles found')).toBeInTheDocument()
      expect(screen.getByText('No roles are available.')).toBeInTheDocument()
    })
  })

  describe('Loading and error states', () => {
    it('displays loading state when query is pending', () => {
      vi.mocked(useQueryState).mockReturnValue(<div data-testid="loading">Loading...</div>)

      render(<RolesTab />, { wrapper })

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('displays error state when query fails', () => {
      vi.mocked(useQueryState).mockReturnValue(<div>Error loading roles</div>)

      render(<RolesTab />, { wrapper })

      expect(screen.getByText('Error loading roles')).toBeInTheDocument()
    })
  })

  describe('Row actions', () => {
    it('shows kebab actions only for non-builtin roles', () => {
      render(<RolesTab />, { wrapper })

      // There should be 2 kebab toggles (custom-editor and viewer), not 3
      const kebabs = screen.getAllByRole('button', { name: 'Kebab toggle' })
      expect(kebabs).toHaveLength(2)
    })

    it('opens edit dialog when edit action is clicked on a custom role', async () => {
      const user = userEvent.setup()
      render(<RolesTab />, { wrapper })

      const kebabs = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(kebabs[0])

      const editOption = await screen.findByRole('menuitem', { name: /edit role/i })
      await user.click(editOption)

      await waitFor(() => {
        expect(screen.getByText('Edit Role')).toBeInTheDocument()
      })
    })

    it('opens delete confirmation when delete action is clicked', async () => {
      const user = userEvent.setup()
      render(<RolesTab />, { wrapper })

      const kebabs = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(kebabs[0])

      const deleteOption = await screen.findByRole('menuitem', { name: /delete role/i })
      await user.click(deleteOption)

      await waitFor(() => {
        expect(screen.getByText('Delete role?')).toBeInTheDocument()
      })
    })
  })

  describe('Delete flow', () => {
    async function openDeleteDialog() {
      const user = userEvent.setup()
      render(<RolesTab />, { wrapper })

      const kebabs = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(kebabs[0])

      const deleteOption = await screen.findByRole('menuitem', { name: /delete role/i })
      await user.click(deleteOption)

      await waitFor(() => {
        expect(screen.getByText('Delete role?')).toBeInTheDocument()
      })
      return user
    }

    it('shows role name in delete confirmation body', async () => {
      await openDeleteDialog()

      // The modal body contains the role name in a <strong> element
      const modalBody = screen.getByText(/permanently delete role/i)
      expect(within(modalBody).getByText('custom-editor')).toBeInTheDocument()
    })

    it('calls delete mutation when Delete button is clicked', async () => {
      const user = await openDeleteDialog()

      await user.click(screen.getByRole('button', { name: 'Delete' }))

      expect(mockDeleteMutate).toHaveBeenCalled()
      const callArgs = mockDeleteMutate.mock.calls[0]
      expect(callArgs[0]).toEqual({ params: { path: { role_id: 'role-2' } } })
    })

    it('refetches roles and closes dialog on successful delete', async () => {
      const user = await openDeleteDialog()

      await user.click(screen.getByRole('button', { name: 'Delete' }))

      const callbacks = mockDeleteMutate.mock.calls[0][1] as {
        onSuccess: () => void
        onSettled: () => void
      }
      act(() => {
        callbacks.onSuccess()
        callbacks.onSettled()
      })

      expect(mockRefetch).toHaveBeenCalled()
      await waitFor(() => {
        expect(screen.queryByText('Delete role?')).not.toBeInTheDocument()
      })
    })

    it('closes dialog on failed delete', async () => {
      const user = await openDeleteDialog()

      await user.click(screen.getByRole('button', { name: 'Delete' }))

      const callbacks = mockDeleteMutate.mock.calls[0][1] as {
        onError: (error: unknown) => void
        onSettled: () => void
      }
      act(() => {
        callbacks.onError(new Error('Server error'))
        callbacks.onSettled()
      })

      await waitFor(() => {
        expect(screen.queryByText('Delete role?')).not.toBeInTheDocument()
      })
    })

    it('closes delete dialog when Cancel button is clicked', async () => {
      const user = await openDeleteDialog()

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByText('Delete role?')).not.toBeInTheDocument()
      })
    })
  })

  describe('Add role dialog', () => {
    it('opens AddRoleDialog when Add role button is clicked', async () => {
      const user = userEvent.setup()
      render(<RolesTab />, { wrapper })

      await user.click(screen.getByRole('button', { name: /add role/i }))

      await waitFor(() => {
        expect(screen.getByText('Add Role')).toBeInTheDocument()
      })
    })
  })

  describe('Sorting', () => {
    it('renders sortable Name column', () => {
      render(<RolesTab />, { wrapper })

      const nameHeader = screen.getByRole('columnheader', { name: /Name/i })
      expect(within(nameHeader).getByRole('button')).toBeInTheDocument()
    })

    it('renders sortable Type column', () => {
      render(<RolesTab />, { wrapper })

      const typeHeader = screen.getByRole('columnheader', { name: /Type/i })
      expect(within(typeHeader).getByRole('button')).toBeInTheDocument()
    })

    it('sends sort parameter when column header is clicked', async () => {
      const user = userEvent.setup()
      render(<RolesTab />, { wrapper })

      const nameHeader = screen.getByRole('columnheader', { name: /Name/i })
      await user.click(within(nameHeader).getByRole('button'))

      await waitFor(() => {
        const lastCall = vi.mocked(accessClient.useQuery).mock.calls.at(-1)
        expect(lastCall).toBeDefined()
        const queryParams = (lastCall?.[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params
          ?.query
        expect(queryParams).toHaveProperty('sort')
      })
    })
  })

  describe('Pagination', () => {
    it('renders pagination controls', () => {
      render(<RolesTab />, { wrapper })

      const nav = screen.getByRole('navigation', { name: /pagination/i })
      expect(nav).toBeInTheDocument()
    })

    it('navigates to next page when next cursor is available', async () => {
      vi.mocked(accessClient.useQuery).mockReturnValue({
        data: { resources: mockRoles, next: 'next-cursor', total: 25 },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: mockRefetch,
      } as never)

      const user = userEvent.setup()
      render(<RolesTab />, { wrapper })

      const nav = screen.getByRole('navigation', { name: /pagination/i })
      const nextButton = within(nav).getByRole('button', { name: /next/i })
      await user.click(nextButton)

      // After clicking next, the cursor param should be sent
      await waitFor(() => {
        const lastCall = vi.mocked(accessClient.useQuery).mock.calls.at(-1)
        const queryParams = (lastCall?.[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params
          ?.query
        expect(queryParams).toHaveProperty('cursor', 'next-cursor')
      })
    })
  })

  describe('Sorting descending', () => {
    it('sends descending sort parameter when column is clicked twice', async () => {
      const user = userEvent.setup()
      render(<RolesTab />, { wrapper })

      const nameHeader = screen.getByRole('columnheader', { name: /Name/i })
      const sortButton = within(nameHeader).getByRole('button')

      // First click: ascending
      await user.click(sortButton)
      // Second click: descending
      await user.click(sortButton)

      await waitFor(() => {
        const lastCall = vi.mocked(accessClient.useQuery).mock.calls.at(-1)
        const queryParams = (lastCall?.[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params
          ?.query
        expect(queryParams).toHaveProperty('sort', '-name')
      })
    })
  })

  describe('Filter bar', () => {
    it('does not offer Description in the attribute field selector', async () => {
      const user = userEvent.setup()
      render(<RolesTab />, { wrapper })

      const filterToolbar = document.getElementById('filter-toolbar')
      expect(filterToolbar).toBeTruthy()
      await user.click(within(filterToolbar as HTMLElement).getByRole('button', { name: /^Name$/ }))

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Scope' })).toBeInTheDocument()
      })
      expect(screen.queryByRole('option', { name: /^Description$/ })).not.toBeInTheDocument()
    })
  })

  describe('Filter empty state', () => {
    it('shows filter empty state when filters are active but no results', async () => {
      // Mock implementation: return data on initial load, empty after filter
      vi.mocked(accessClient.useQuery).mockImplementation((...args: unknown[]) => {
        const opts = args[2] as { params?: { query?: Record<string, unknown> } } | undefined
        const hasNameFilter = opts?.params?.query?.['name[contains]']
        return {
          data: { resources: hasNameFilter ? [] : mockRoles, next: null, total: hasNameFilter ? 0 : 3 },
          isPending: false,
          isError: false,
          error: null,
          isFetching: false,
          refetch: mockRefetch,
        } as never
      })

      const user = userEvent.setup()
      render(<RolesTab />, { wrapper })

      // Apply a filter by typing in the name filter input and pressing Enter
      const textInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(textInput, 'nonexistent')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument()
      })
    })
  })
})
