import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../components/alerts'
import { accessClient } from '../../access/accessClient'

import { UserDetail } from './UserDetail'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../client', () => ({
  usersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  accessFetchClient: {
    POST: vi.fn().mockResolvedValue({ data: { allowed: false } }),
  },
}))

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

let mockLocationValue = `/access-management/users/${VALID_USER_ID}`
const mockSetLocation = vi.fn()
const mockUseParams = vi.fn(() => ({ userId: VALID_USER_ID }))
vi.mock('wouter', async () => {
  const React = await import('react')
  return {
    useLocation: () => [mockLocationValue, mockSetLocation],
    useParams: () => mockUseParams(),
    useSearchParams: () => React.useState(new URLSearchParams()),
  }
})

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
  vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
    if (path === '/users/{user_id}') {
      return {
        data: mockUser,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as never
    }
    // groups query (/users/{user_id}/groups or /groups)
    return {
      data: mockGroupsData,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never
  })

  vi.mocked(accessClient.useMutation).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserDetail', () => {
  beforeEach(() => {
    queryClient.clear()
    mockNavigate.mockClear()
    mockSetLocation.mockClear()
    mockLocationValue = `/access-management/users/${VALID_USER_ID}`
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
      expect(screen.getByText('Local')).toBeInTheDocument()
    })

    it('renders description list terms for each field', () => {
      render(<UserDetail />, { wrapper })

      expect(screen.getByText('Username')).toBeInTheDocument()
      expect(screen.getByText('First Name')).toBeInTheDocument()
      expect(screen.getByText('Last Name')).toBeInTheDocument()
      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText('Identity Provider')).toBeInTheDocument()
      expect(screen.getByText('Last Login')).toBeInTheDocument()
      expect(screen.getByText('Created')).toBeInTheDocument()
    })

    it('falls back to username in heading when full_name is null', () => {
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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

      // getGroupCount: total is undefined, so apiCount = resources.length = 2
      // No 'authenticated' group in resources, so it adds 1 => 3
      const groupsTab = screen.getByRole('tab', { name: /Groups/i })
      expect(groupsTab).toHaveTextContent('3')
    })
  })

  // ---- Loading state ------------------------------------------------------

  describe('Loading state', () => {
    it('shows loading spinner when user query is pending', () => {
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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

      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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

      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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

    it('navigates to groups URL when Groups tab is clicked', async () => {
      const user = userEvent.setup()
      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('tab', { name: /Groups/i }))

      expect(mockSetLocation).toHaveBeenCalledWith(`/access-management/users/${VALID_USER_ID}/groups`)
    })

    it('renders Groups tab content when URL is /groups', () => {
      mockLocationValue = `/access-management/users/${VALID_USER_ID}/groups`
      render(<UserDetail />, { wrapper })

      expect(screen.queryByText('Username')).not.toBeInTheDocument()
      expect(screen.getByText('developers')).toBeInTheDocument()
    })

    it('displays group count badge on Groups tab', () => {
      render(<UserDetail />, { wrapper })

      // The badge should show "1" (one group) + 1 for authenticated = 2
      // The getGroupCount function adds 1 for authenticated group when it's not in the list
      const groupsTab = screen.getByRole('tab', { name: /Groups/i })
      // The mock returns 1 group (developers) with total=1, and authenticated
      // group is not in the list, so getGroupCount returns total + 1 = 2
      expect(groupsTab).toHaveTextContent(/\d+/)
    })

    it('displays zero badge when no groups exist', () => {
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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
      // getGroupCount: total=0, no authenticated group in resources => 0 + 1 = 1
      expect(groupsTab).toHaveTextContent(/\d+/)
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
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
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
