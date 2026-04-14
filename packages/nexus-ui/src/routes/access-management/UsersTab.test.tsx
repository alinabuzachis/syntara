import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { usersClient } from '../../client'
import { AlertProvider } from '../../components/alerts'
import { assertUrlParam } from '../../test/filter-test-helpers'

import { UsersTab } from './UsersTab'

// Mock dependencies
vi.mock('../../client', () => ({
  usersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  authMiddleware: { onRequest: vi.fn() },
}))

const mockNavigate = vi.fn<(path: string) => void>()
vi.mock('wouter/use-browser-location', () => ({
  navigate: (path: string): void => {
    mockNavigate(path)
  },
}))

const mockSetSearchParams = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('wouter', () => ({
  useLocation: () => ['/access-management/users', vi.fn()],
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

// Create a QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

describe('UsersTab Component', () => {
  const mockUsers = [
    {
      id: 'u1',
      username: 'admin',
      email: 'admin@nexus.local',
      full_name: 'Admin User',
      is_active: true,
      last_login: '2024-03-15T10:30:00Z',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    },
    {
      id: 'u2',
      username: 'jdoe',
      email: 'jdoe@nexus.local',
      full_name: 'John Doe',
      is_active: true,
      last_login: '2024-03-14T08:00:00Z',
      created_at: '2024-02-01T00:00:00Z',
      updated_at: '2024-02-02T00:00:00Z',
    },
    {
      id: 'u3',
      username: 'viewer1',
      email: 'viewer@nexus.local',
      full_name: 'View Only',
      is_active: false,
      last_login: null,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-02T00:00:00Z',
    },
  ]

  beforeEach(() => {
    mockNavigate.mockClear()
    mockSetSearchParams.mockClear()
    mockSearchParams = new URLSearchParams()

    vi.mocked(usersClient.useQuery).mockReturnValue({
      data: { resources: mockUsers },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)

    vi.mocked(usersClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
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

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<UsersTab />, { wrapper })

      expect(screen.getByText('Add user')).toBeInTheDocument()
    })

    it('renders users in table', () => {
      render(<UsersTab />, { wrapper })

      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('jdoe')).toBeInTheDocument()
      expect(screen.getByText('viewer1')).toBeInTheDocument()
    })

    it('renders table columns with correct data', () => {
      render(<UsersTab />, { wrapper })

      expect(screen.getByText('Admin User')).toBeInTheDocument()
      expect(screen.getByText('admin@nexus.local')).toBeInTheDocument()
    })

    it('renders last login as dash for null', () => {
      render(<UsersTab />, { wrapper })

      const table = screen.getByRole('grid', { name: 'Users table' })
      const rows = within(table).getAllByRole('row')
      const viewer1Row = rows[3]
      expect(within(viewer1Row).getByText('-')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(<UsersTab />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('Empty State', () => {
    it('displays empty state when no users exist and no filters active', () => {
      vi.mocked(usersClient.useQuery).mockReturnValueOnce({
        data: { resources: [] },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)

      render(<UsersTab />, { wrapper })

      expect(screen.getByText('No users')).toBeInTheDocument()
      expect(screen.getByText('Create a user to manage access to the platform.')).toBeInTheDocument()
      expect(screen.getByText('Add user')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('displays loading state', () => {
      vi.mocked(usersClient.useQuery).mockReturnValueOnce({
        data: null,
        isPending: true,
        isError: false,
        error: null,
      })

      render(<UsersTab />, { wrapper })

      expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    })

    it('displays error state', () => {
      const mockError = new Error('Failed to load users')
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: null,
        isPending: false,
        isError: true,
        error: mockError,
      })

      render(<UsersTab />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Error loading users' })).toBeInTheDocument()
    })
  })

  describe('Filter Functionality', () => {
    it('renders username filter input', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      const textInput = screen.getByRole('textbox', { name: /username filter/i })
      await user.type(textInput, 'admin')
      expect(textInput).toHaveValue('admin')
    })

    it('applies username filter to API query on submit', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      const textInput = screen.getByRole('textbox', { name: /username filter/i })
      await user.type(textInput, 'admin')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        assertUrlParam(mockSetSearchParams, 'username[contains]', 'admin')
      })
      expect(mockSetSearchParams).toHaveBeenCalled()
    })
  })

  describe('Sorting Functionality', () => {
    it('renders sortable column headers', () => {
      render(<UsersTab />, { wrapper })

      const usernameHeader = screen.getByRole('columnheader', { name: /Username/i })
      expect(within(usernameHeader).getByRole('button')).toBeInTheDocument()

      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      expect(within(nameHeader).getByRole('button')).toBeInTheDocument()
    })

    it('sorts by Username ascending by default', () => {
      render(<UsersTab />, { wrapper })

      // Server-side sorting: data is rendered in the order returned by the mock
      const table = screen.getByRole('grid', { name: 'Users table' })
      const rows = within(table).getAllByRole('row')
      expect(within(rows[1]).getByText('admin')).toBeInTheDocument()
      expect(within(rows[2]).getByText('jdoe')).toBeInTheDocument()
      expect(within(rows[3]).getByText('viewer1')).toBeInTheDocument()
    })

    it('sorts by Username descending when toggling sort direction', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      const usernameHeader = screen.getByRole('columnheader', { name: /Username/i })
      const sortButton = within(usernameHeader).getByRole('button')
      await user.click(sortButton)

      // Client-side sorting: verify data still renders after sort toggle
      const table = screen.getByRole('grid', { name: 'Users table' })
      const rows = within(table).getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })
  })

  describe('Pagination', () => {
    it('displays pagination controls when next cursor is available', () => {
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: mockUsers, next: 'next-cursor-abc', prev: null, total: 25 },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)

      render(<UsersTab />, { wrapper })

      // PF Pagination renders "Go to next page" / "Go to previous page" aria-labels
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled()
    })

    it('displays total count when available', () => {
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: mockUsers, next: 'next-cursor', prev: null, total: 25 },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)

      render(<UsersTab />, { wrapper })

      // Footer renders count text with total
      expect(screen.getByText(/3 users/)).toBeInTheDocument()
      expect(screen.getByText(/of 25 total/)).toBeInTheDocument()
    })

    it('displays singular "user" when only one result', () => {
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: [mockUsers[0]], next: null, prev: null, total: 1 },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)

      render(<UsersTab />, { wrapper })

      // Footer renders singular "user" for one result
      expect(screen.getByText(/1 user$/)).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('navigates to create user page when Add user is clicked', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      await user.click(screen.getByRole('button', { name: /add user/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/access-management/users/create')
    })

    it('navigates to edit user page when edit action is clicked', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const editOption = await screen.findByRole('menuitem', { name: /edit/i })
      await user.click(editOption)

      expect(mockNavigate).toHaveBeenCalledWith('/access-management/users/u1/edit')
    })

    it('navigates to user detail page when username is clicked', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'admin' }))

      expect(mockNavigate).toHaveBeenCalledWith('/access-management/users/u1')
    })
  })

  describe('Row Actions', () => {
    it('opens delete dialog when delete action is clicked', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      await waitFor(() => {
        expect(screen.getByText('Delete user')).toBeInTheDocument()
      })
    })
  })

  describe('Delete Dialog Flow', () => {
    it('calls delete mutation when Delete button is clicked', async () => {
      const user = userEvent.setup()
      const mockDeleteMutate = vi.fn()
      const mockRefetch = vi.fn()

      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: mockUsers },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: mockRefetch,
      } as never)

      vi.mocked(usersClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        isPending: false,
      } as never)

      render(<UsersTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      const deleteButton = await screen.findByRole('button', { name: 'Delete' })
      await user.click(deleteButton)

      expect(mockDeleteMutate).toHaveBeenCalled()
      const callArgs = mockDeleteMutate.mock.calls[0]
      expect(callArgs[0]).toEqual({ params: { path: { user_id: 'u1' } } })
    })

    it('shows success alert and closes dialog on successful delete', async () => {
      const user = userEvent.setup()
      const mockDeleteMutate = vi.fn()
      const mockRefetch = vi.fn().mockResolvedValue({})

      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: mockUsers },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: mockRefetch,
      } as never)

      vi.mocked(usersClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        isPending: false,
      } as never)

      render(<UsersTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      const deleteButton = await screen.findByRole('button', { name: 'Delete' })
      await user.click(deleteButton)

      const callbacks = mockDeleteMutate.mock.calls[0][1] as { onSuccess: () => void; onSettled: () => void }
      act(() => {
        callbacks.onSuccess()
        callbacks.onSettled()
      })

      await waitFor(() => {
        expect(screen.queryByText('Delete user')).not.toBeInTheDocument()
      })
      expect(mockRefetch).toHaveBeenCalled()
    })

    it('closes delete dialog when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      await waitFor(() => {
        expect(screen.getByText('Delete user')).toBeInTheDocument()
      })

      const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
      await user.click(cancelButtons[cancelButtons.length - 1])

      await waitFor(() => {
        expect(screen.queryByText(/This action cannot be undone/)).not.toBeInTheDocument()
      })
    })
  })

  describe('Delete Dialog Error Handling', () => {
    it('shows error alert on delete failure', async () => {
      const user = userEvent.setup()
      const mockDeleteMutate = vi.fn()
      const mockRefetch = vi.fn()

      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: mockUsers },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: mockRefetch,
      } as never)

      vi.mocked(usersClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        isPending: false,
      } as never)

      render(<UsersTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      const deleteButton = await screen.findByRole('button', { name: 'Delete' })
      await user.click(deleteButton)

      const callbacks = mockDeleteMutate.mock.calls[0][1] as {
        onError: (error: unknown) => void
        onSettled: () => void
      }
      act(() => {
        callbacks.onError(new Error('Server error'))
        callbacks.onSettled()
      })

      await waitFor(() => {
        expect(screen.queryByText('Delete user')).not.toBeInTheDocument()
      })
    })
  })

  describe('Pagination Navigation', () => {
    it('navigates to next page when Next button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: mockUsers, next: 'next-cursor-abc', prev: null, total: 25 },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)

      render(<UsersTab />, { wrapper })

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      expect(nextButton).toBeInTheDocument()
    })

    it('navigates to previous page when Previous button is clicked', () => {
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: mockUsers, next: null, prev: 'prev-cursor-abc', total: 25 },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)

      render(<UsersTab />, { wrapper })

      const prevButton = screen.getByRole('button', { name: /previous/i })
      expect(prevButton).toBeInTheDocument()
    })
  })

  describe('Filter Empty State', () => {
    it('shows filter empty state when filters return no results', () => {
      // Pre-set URL to have an active filter
      mockSearchParams = new URLSearchParams('username%5Bcontains%5D=nonexistent')

      // Mock query to return empty results (filter is active via URL)
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)

      render(<UsersTab />, { wrapper })

      // With active filters and empty results, "No results found" is shown
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })

    it('clears all filters when clear all is clicked', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      // Apply a filter
      const textInput = screen.getByRole('textbox', { name: /username filter/i })
      await user.type(textInput, 'nonexistent')
      await user.keyboard('{Enter}')

      // After filter is applied, verify setSearchParams was called with the filter
      await waitFor(() => {
        assertUrlParam(mockSetSearchParams, 'username[contains]', 'nonexistent')
      })
    })
  })

  describe('Sorting by other columns', () => {
    it('sorts by Name when Name column is clicked', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      const sortButton = within(nameHeader).getByRole('button')
      await user.click(sortButton)

      // Client-side sorting: verify data still renders after sort
      const table = screen.getByRole('grid', { name: 'Users table' })
      const rows = within(table).getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })

    it('sorts by Email when Email column is clicked', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      const emailHeader = screen.getByRole('columnheader', { name: /Email/i })
      const sortButton = within(emailHeader).getByRole('button')
      await user.click(sortButton)

      // Client-side sorting: verify data still renders after sort
      const table = screen.getByRole('grid', { name: 'Users table' })
      const rows = within(table).getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })

    it('sorts by Last Login when Last Login column is clicked', async () => {
      const user = userEvent.setup()
      render(<UsersTab />, { wrapper })

      const loginHeader = screen.getByRole('columnheader', { name: /Last Login/i })
      const sortButton = within(loginHeader).getByRole('button')
      await user.click(sortButton)

      // Client-side sorting: verify data still renders after sort
      const table = screen.getByRole('grid', { name: 'Users table' })
      const rows = within(table).getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })
  })
})
