import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { usersClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'

import { UserDetail } from './UserDetail'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../client', () => ({
  usersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

const mockUseParams = vi.fn(() => ({ userId: VALID_USER_ID }))
vi.mock('wouter', () => ({
  useLocation: () => [`/access-management/users/${VALID_USER_ID}`, vi.fn()],
  useParams: () => mockUseParams(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

const mockNavigate = vi.fn()
vi.mock('wouter/use-browser-location', () => ({
  navigate: (...args: unknown[]): void => {
    mockNavigate(...args)
  },
}))

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockUser = {
  id: VALID_USER_ID,
  username: 'jdoe',
  email: 'jdoe@nexus.local',
  full_name: 'John Doe',
  role: 'creator',
  is_active: true,
  last_login: '2026-03-28T09:15:00Z',
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-02-10T00:00:00Z',
}

const mockGroupsData = {
  resources: [{ id: 'g1', name: 'developers' }],
  total: 1,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

/** Default mock return for a successful user + groups query pair. */
function mockSuccessQueries() {
  vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
    if (path === '/users/{user_id}') {
      return {
        data: mockUser,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as never
    }
    // groups query
    return {
      data: mockGroupsData,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserDetail', () => {
  beforeEach(() => {
    queryClient.clear()
    mockNavigate.mockClear()
    mockUseParams.mockReturnValue({ userId: VALID_USER_ID })
    mockSuccessQueries()
  })

  // ---- Rendering ----------------------------------------------------------

  describe('Rendering', () => {
    it('renders user details on success', () => {
      render(<UserDetail />, { wrapper })

      // Header shows full name
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument()

      // Description list fields
      expect(screen.getByText('jdoe')).toBeInTheDocument()
      expect(screen.getByText('John')).toBeInTheDocument()
      expect(screen.getByText('Doe')).toBeInTheDocument()
      expect(screen.getByText('jdoe@nexus.local')).toBeInTheDocument()
      expect(screen.getByText('Creator')).toBeInTheDocument()
      expect(screen.getByText('Local')).toBeInTheDocument()
    })

    it('renders description list terms for each field', () => {
      render(<UserDetail />, { wrapper })

      expect(screen.getByText('Username')).toBeInTheDocument()
      expect(screen.getByText('First Name')).toBeInTheDocument()
      expect(screen.getByText('Last Name')).toBeInTheDocument()
      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText('System Role')).toBeInTheDocument()
      expect(screen.getByText('Identity Provider')).toBeInTheDocument()
      expect(screen.getByText('Last Login')).toBeInTheDocument()
      expect(screen.getByText('Created')).toBeInTheDocument()
    })

    it('falls back to username in heading when full_name is null', () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: { ...mockUser, full_name: null },
            isPending: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          } as never
        }
        return {
          data: mockGroupsData,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      render(<UserDetail />, { wrapper })

      expect(screen.getByRole('heading', { name: 'jdoe' })).toBeInTheDocument()
    })

    it('renders null when userData is undefined and no error', () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: undefined,
            isPending: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          } as never
        }
        return {
          data: mockGroupsData,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      const { container } = render(<UserDetail />, { wrapper })

      // Component returns null when no userData and no error/loading
      expect(container.innerHTML).toBe('')
    })

    it('uses resources.length for group count when total is missing', () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: mockUser,
            isPending: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          } as never
        }
        return {
          data: {
            resources: [
              { id: 'g1', name: 'dev' },
              { id: 'g2', name: 'ops' },
            ],
          },
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      render(<UserDetail />, { wrapper })

      const groupsTab = screen.getByRole('tab', { name: /Groups/i })
      expect(groupsTab).toHaveTextContent('2')
    })

    it('handles unknown role gracefully', () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: { ...mockUser, role: 'unknown_role' },
            isPending: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          } as never
        }
        return {
          data: mockGroupsData,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      render(<UserDetail />, { wrapper })

      // Falls back to raw role text
      expect(screen.getByText('unknown_role')).toBeInTheDocument()
    })
  })

  // ---- Loading state ------------------------------------------------------

  describe('Loading state', () => {
    it('shows loading spinner when user query is pending', () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: undefined,
            isPending: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
          } as never
        }
        return {
          data: mockGroupsData,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      render(<UserDetail />, { wrapper })

      expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    })
  })

  // ---- Error state --------------------------------------------------------

  describe('Error state', () => {
    it('shows "User not found" empty state when query errors', () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: undefined,
            isPending: false,
            isError: true,
            error: new Error('Not found'),
            refetch: vi.fn(),
          } as never
        }
        return {
          data: mockGroupsData,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      render(<UserDetail />, { wrapper })

      expect(screen.getByRole('heading', { name: 'User not found' })).toBeInTheDocument()
      expect(
        screen.getByText('The user you are looking for does not exist or may have been deleted.')
      ).toBeInTheDocument()
    })

    it('renders Back to users button in error state', () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: undefined,
            isPending: false,
            isError: true,
            error: new Error('Not found'),
            refetch: vi.fn(),
          } as never
        }
        return {
          data: undefined,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      render(<UserDetail />, { wrapper })

      expect(screen.getByRole('button', { name: 'Back to users' })).toBeInTheDocument()
    })

    it('renders Retry button in error state', () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: undefined,
            isPending: false,
            isError: true,
            error: new Error('Not found'),
            refetch: vi.fn(),
          } as never
        }
        return {
          data: undefined,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      render(<UserDetail />, { wrapper })

      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    it('calls refetch when Retry button is clicked', async () => {
      const user = userEvent.setup()
      const mockRefetch = vi.fn().mockResolvedValue({})

      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: undefined,
            isPending: false,
            isError: true,
            error: new Error('Not found'),
            refetch: mockRefetch,
          } as never
        }
        return {
          data: undefined,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn().mockResolvedValue({}),
        } as never
      })

      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Retry' }))

      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  // ---- Navigation ---------------------------------------------------------

  describe('Navigation', () => {
    it('navigates back to users list when back button is clicked', async () => {
      const user = userEvent.setup()
      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Back to users' }))

      expect(mockNavigate).toHaveBeenCalledWith('/access-management/users')
    })

    it('navigates to edit page when Edit user button is clicked', async () => {
      const user = userEvent.setup()
      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Edit user' }))

      expect(mockNavigate).toHaveBeenCalledWith(`/access-management/users/${VALID_USER_ID}/edit`)
    })

    it('navigates back to users list when Back to users button in error state is clicked', async () => {
      const user = userEvent.setup()

      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: undefined,
            isPending: false,
            isError: true,
            error: new Error('Not found'),
            refetch: vi.fn(),
          } as never
        }
        return {
          data: undefined,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Back to users' }))

      expect(mockNavigate).toHaveBeenCalledWith('/access-management/users')
    })
  })

  // ---- Tabs ---------------------------------------------------------------

  describe('Tabs', () => {
    it('renders Details and Groups tabs', () => {
      render(<UserDetail />, { wrapper })

      expect(screen.getByRole('tab', { name: /Details/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Groups/i })).toBeInTheDocument()
    })

    it('shows Details tab content by default', () => {
      render(<UserDetail />, { wrapper })

      // Details tab content: description list terms are visible
      expect(screen.getByText('Username')).toBeInTheDocument()
      expect(screen.getByText('jdoe')).toBeInTheDocument()
    })

    it('switches to Groups tab and renders UserGroupsPanel', async () => {
      const user = userEvent.setup()
      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('tab', { name: /Groups/i }))

      // After switching, the Details description list terms should no longer render
      expect(screen.queryByText('Username')).not.toBeInTheDocument()
      // Groups panel should be rendered (it shows the group name from mock data)
      expect(screen.getByText('developers')).toBeInTheDocument()
    })

    it('displays group count badge on Groups tab', () => {
      render(<UserDetail />, { wrapper })

      // The badge should show "1" (one group)
      const groupsTab = screen.getByRole('tab', { name: /Groups/i })
      expect(groupsTab).toHaveTextContent('1')
    })

    it('displays zero badge when no groups exist', () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: mockUser,
            isPending: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          } as never
        }
        return {
          data: { resources: [], total: 0 },
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      render(<UserDetail />, { wrapper })

      const groupsTab = screen.getByRole('tab', { name: /Groups/i })
      expect(groupsTab).toHaveTextContent('0')
    })
  })

  // ---- Accessibility ------------------------------------------------------

  describe('Accessibility', () => {
    it('has no accessibility violations on success state', async () => {
      const { container } = render(<UserDetail />, { wrapper })

      // Wrap axe in act() — axe triggers DOM events (focus, scroll) that
      // cause PatternFly Tabs to schedule React state updates
      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        // Exclude aria-valid-attr-value: PatternFly Tabs generates aria-controls
        // referencing lazily-rendered tab panels that don't exist in the DOM yet
        results = await axe(container, {
          rules: { 'aria-valid-attr-value': { enabled: false } },
        })
      })
      expect(results!).toHaveNoViolations()
    })

    it('has no accessibility violations on error state', async () => {
      vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: undefined,
            isPending: false,
            isError: true,
            error: new Error('Not found'),
            refetch: vi.fn(),
          } as never
        }
        return {
          data: undefined,
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        } as never
      })

      const { container } = render(<UserDetail />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
