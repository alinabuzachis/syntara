import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../providers/alerts'
import { accessClient } from '../../access/accessClient'

import { UserDetail } from './UserDetail'
import { computeRoleAssignmentCount } from './userDetailUtils'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
  authClient: {
    useQuery: vi.fn().mockReturnValue({ data: undefined, isPending: false, isError: false, error: null }),
  },
  usersClient: {
    useQuery: vi.fn().mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  },
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

let mockLocationValue = `/system-administration/access-management/users/${VALID_USER_ID}`
const mockSetLocation = vi.fn()
const mockUseParams = vi.fn(() => ({ userId: VALID_USER_ID }))
vi.mock('wouter', async () => {
  const React = await import('react')
  return {
    useLocation: () => [mockLocationValue, mockSetLocation],
    useParams: () => mockUseParams(),
    useSearch: () => '',
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
  is_enabled: true,
  auth_type: 'local' as const,
  last_login: '2026-03-28T09:15:00Z',
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-02-10T00:00:00Z',
}

const emptyIdentitiesResult = {
  data: [],
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
} as never

const mockGroupsData = {
  resources: [{ id: 'g1', name: 'developers' }],
  total: 1,
}

const mockIdpUser = {
  ...mockUser,
  auth_type: 'idp' as const,
}

const mockIdentitiesData = {
  resources: [
    { id: 'id1', identity_provider_id: 'idp-1', provider_name: 'Okta' },
    { id: 'id2', identity_provider_id: 'idp-2', provider_name: 'Azure AD' },
  ],
}

const mockGroupsWithAuthenticated = {
  resources: [
    { id: 'g1', name: 'developers' },
    { id: 'g2', name: 'authenticated' },
  ],
  total: 2,
}

const mockRoleAssignmentsData = {
  resources: [
    { id: 'ra1', role: 'admin', scope: 'global' },
    { id: 'ra2', role: 'viewer', scope: 'global' },
    { id: 'ra3', role: 'editor', scope: 'project-1' },
  ],
  total: 3,
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

/** Build a mock query result */
function buildQueryResult(data: unknown) {
  return {
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({}),
  } as never
}

/** Configure accessClient.useQuery with per-path overrides */
function mockQueryByPath(pathResults: Record<string, unknown>) {
  vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
    if (path in pathResults) {
      return buildQueryResult(pathResults[path])
    }
    return buildQueryResult(undefined)
  })
  vi.mocked(accessClient.useMutation).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)
}

/** Default mock return for a successful user + groups + identities + role-assignments query set. */
function mockSuccessQueries(roleAssignments = mockRoleAssignmentsData) {
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
    if (path === '/users/{user_id}/identities') {
      return {
        data: [],
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as never
    }
    if (path === '/users/{user_id}/role-assignments') {
      return {
        data: roleAssignments,
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

describe('computeRoleAssignmentCount', () => {
  it('returns total when present', () => {
    expect(computeRoleAssignmentCount({ total: 5, resources: [1, 2] })).toBe(5)
  })

  it('returns total when total is 0', () => {
    expect(computeRoleAssignmentCount({ total: 0, resources: [1] })).toBe(0)
  })

  it('returns resources.length when total is undefined', () => {
    expect(computeRoleAssignmentCount({ resources: [1, 2, 3] })).toBe(3)
  })

  it('returns 0 when data has no total or resources', () => {
    expect(computeRoleAssignmentCount({})).toBe(0)
  })

  it('returns 0 when resources is undefined and total is null', () => {
    expect(computeRoleAssignmentCount({ total: null })).toBe(0)
  })
})

describe('UserDetail', () => {
  beforeEach(() => {
    queryClient.clear()
    mockNavigate.mockClear()
    mockSetLocation.mockClear()
    mockLocationValue = `/system-administration/access-management/users/${VALID_USER_ID}`
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
      expect(screen.getByText(VALID_USER_ID)).toBeInTheDocument()
      expect(screen.getByText('John')).toBeInTheDocument()
      expect(screen.getByText('Doe')).toBeInTheDocument()
      expect(screen.getByText('jdoe@nexus.local')).toBeInTheDocument()
      expect(screen.getByText('Local')).toBeInTheDocument()
    })

    it('renders description list terms for each field', () => {
      render(<UserDetail />, { wrapper })

      expect(screen.getByText('Username')).toBeInTheDocument()
      expect(screen.getByText('User ID')).toBeInTheDocument()
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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

      // groupCount: total is undefined, so count = resources.length = 2
      // +1 for implicit 'authenticated' group (not in the list)
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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
    it('navigates to edit page when Edit user button is clicked', async () => {
      const user = userEvent.setup()
      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Edit user' }))

      expect(mockNavigate).toHaveBeenCalledWith(`/system-administration/access-management/users/${VALID_USER_ID}/edit`)
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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

      expect(mockNavigate).toHaveBeenCalledWith('/system-administration/access-management/users')
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

    it('navigates to identities URL when Identities tab is clicked', async () => {
      const user = userEvent.setup()
      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('tab', { name: /Identities/i }))

      expect(mockSetLocation).toHaveBeenCalledWith(
        `/system-administration/access-management/users/${VALID_USER_ID}/identities`
      )
    })

    it('navigates to groups URL when Groups tab is clicked', async () => {
      const user = userEvent.setup()
      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('tab', { name: /Groups/i }))

      expect(mockSetLocation).toHaveBeenCalledWith(
        `/system-administration/access-management/users/${VALID_USER_ID}/groups`
      )
    })

    it('renders Groups tab content when URL is /groups', () => {
      mockLocationValue = `/system-administration/access-management/users/${VALID_USER_ID}/groups`
      render(<UserDetail />, { wrapper })

      expect(screen.queryByText('Username')).not.toBeInTheDocument()
      expect(screen.getByText('developers')).toBeInTheDocument()
    })

    it('displays group count badge on Groups tab', () => {
      render(<UserDetail />, { wrapper })

      // The badge should show the group count (1 group)
      const groupsTab = screen.getByRole('tab', { name: /Groups/i })
      // The mock returns 1 group (developers) with total=1
      expect(groupsTab).toHaveTextContent(/\d+/)
    })

    it('renders Role Assignments tab', () => {
      render(<UserDetail />, { wrapper })

      expect(screen.getByRole('tab', { name: /Role Assignments/i })).toBeInTheDocument()
    })

    it('navigates to roles URL when Role Assignments tab is clicked', async () => {
      const user = userEvent.setup()
      render(<UserDetail />, { wrapper })

      await user.click(screen.getByRole('tab', { name: /Role Assignments/i }))

      expect(mockSetLocation).toHaveBeenCalledWith(
        `/system-administration/access-management/users/${VALID_USER_ID}/roles`
      )
    })

    it('renders Identities tab with count badge', () => {
      render(<UserDetail />, { wrapper })

      const identitiesTab = screen.getByRole('tab', { name: /Identities/i })
      expect(identitiesTab).toBeInTheDocument()
      expect(identitiesTab).toHaveTextContent('0')
    })

    it('shows DisabledBadge for disabled users', () => {
      vi.mocked(accessClient.useQuery).mockImplementation((_method, path) => {
        if (path === '/users/{user_id}') {
          return {
            data: { ...mockUser, is_enabled: false },
            isPending: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          } as never
        }
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
        if (path === '/users/{user_id}/role-assignments') {
          return {
            data: mockRoleAssignmentsData,
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

      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })

    it('displays role assignment count badge on Role Assignments tab', () => {
      render(<UserDetail />, { wrapper })

      const rolesTab = screen.getByRole('tab', { name: /Role Assignments/i })
      expect(rolesTab).toHaveTextContent('3')
    })

    it('uses total for role assignment count when both total and resources are present', () => {
      mockSuccessQueries({
        resources: [{ id: 'ra1', role: 'admin', scope: 'global' }],
        total: 10,
      })
      render(<UserDetail />, { wrapper })

      const rolesTab = screen.getByRole('tab', { name: /Role Assignments/i })
      expect(rolesTab).toHaveTextContent('10')
    })

    it('falls back to resources.length for role assignment count when total is undefined', () => {
      mockSuccessQueries({
        resources: [
          { id: 'ra1', role: 'admin', scope: 'global' },
          { id: 'ra2', role: 'viewer', scope: 'global' },
        ],
      } as typeof mockRoleAssignmentsData)
      render(<UserDetail />, { wrapper })

      const rolesTab = screen.getByRole('tab', { name: /Role Assignments/i })
      expect(rolesTab).toHaveTextContent('2')
    })

    it('shows zero when total is explicitly 0', () => {
      mockSuccessQueries({
        resources: [],
        total: 0,
      })
      render(<UserDetail />, { wrapper })

      const rolesTab = screen.getByRole('tab', { name: /Role Assignments/i })
      expect(rolesTab).toHaveTextContent('0')
    })

    it('shows zero role assignment count when data is null', () => {
      mockSuccessQueries(null as unknown as typeof mockRoleAssignmentsData)
      render(<UserDetail />, { wrapper })

      const rolesTab = screen.getByRole('tab', { name: /Role Assignments/i })
      expect(rolesTab).toHaveTextContent('0')
    })

    it('shows zero role assignment count when data has no total or resources', () => {
      mockSuccessQueries({} as typeof mockRoleAssignmentsData)
      render(<UserDetail />, { wrapper })

      const rolesTab = screen.getByRole('tab', { name: /Role Assignments/i })
      expect(rolesTab).toHaveTextContent('0')
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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
      // groupCount: total=0 (no groups)
      expect(groupsTab).toHaveTextContent(/\d+/)
    })
  })

  // ---- Identity Provider rendering ----------------------------------------

  describe('Identity Provider display', () => {
    it('shows "Identity Provider" label (singular) for a single IdP', () => {
      mockQueryByPath({
        '/users/{user_id}': mockIdpUser,
        '/users/{user_id}/groups': mockGroupsData,
        '/users/{user_id}/identities': {
          resources: [{ id: 'id1', identity_provider_id: 'idp-1', provider_name: 'Okta' }],
        },
        '/users/{user_id}/role-assignments': mockRoleAssignmentsData,
      })
      render(<UserDetail />, { wrapper })

      expect(screen.getByText('Identity Provider')).toBeInTheDocument()
      expect(screen.getByText('Okta')).toBeInTheDocument()
    })

    it('shows "Identity Providers" label (plural) for multiple IdPs', () => {
      mockQueryByPath({
        '/users/{user_id}': mockIdpUser,
        '/users/{user_id}/groups': mockGroupsData,
        '/users/{user_id}/identities': mockIdentitiesData,
        '/users/{user_id}/role-assignments': mockRoleAssignmentsData,
      })
      render(<UserDetail />, { wrapper })

      expect(screen.getByText('Identity Providers')).toBeInTheDocument()
      expect(screen.getByText('Okta')).toBeInTheDocument()
      expect(screen.getByText('Azure AD')).toBeInTheDocument()
    })

    it('navigates to IdP detail when clicking provider label', async () => {
      const user = userEvent.setup()
      mockQueryByPath({
        '/users/{user_id}': mockIdpUser,
        '/users/{user_id}/groups': mockGroupsData,
        '/users/{user_id}/identities': {
          resources: [{ id: 'id1', identity_provider_id: 'idp-1', provider_name: 'Okta' }],
        },
        '/users/{user_id}/role-assignments': mockRoleAssignmentsData,
      })
      render(<UserDetail />, { wrapper })

      await user.click(screen.getByText('Okta'))

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining('/system-administration/authentication/identity-providers/idp-1')
      )
    })

    it('deduplicates providers with the same identity_provider_id', () => {
      mockQueryByPath({
        '/users/{user_id}': mockIdpUser,
        '/users/{user_id}/groups': mockGroupsData,
        '/users/{user_id}/identities': {
          resources: [
            { id: 'id1', identity_provider_id: 'idp-1', provider_name: 'Okta' },
            { id: 'id2', identity_provider_id: 'idp-1', provider_name: 'Okta' },
          ],
        },
        '/users/{user_id}/role-assignments': mockRoleAssignmentsData,
      })
      render(<UserDetail />, { wrapper })

      expect(screen.getByText('Identity Provider')).toBeInTheDocument()
      expect(screen.getAllByText('Okta')).toHaveLength(1)
    })

    it('shows "Local" label for local auth type users', () => {
      render(<UserDetail />, { wrapper })

      expect(screen.getByText('Identity Provider')).toBeInTheDocument()
      expect(screen.getByText('Local')).toBeInTheDocument()
    })

    it('shows dash when IdP user has zero identities', () => {
      mockQueryByPath({
        '/users/{user_id}': mockIdpUser,
        '/users/{user_id}/groups': mockGroupsData,
        '/users/{user_id}/identities': { resources: [] },
        '/users/{user_id}/role-assignments': mockRoleAssignmentsData,
      })
      render(<UserDetail />, { wrapper })

      expect(screen.getByText('Identity Provider')).toBeInTheDocument()
      expect(screen.getByText('-')).toBeInTheDocument()
    })

    it('handles identity with null provider_name', () => {
      mockQueryByPath({
        '/users/{user_id}': mockIdpUser,
        '/users/{user_id}/groups': mockGroupsData,
        '/users/{user_id}/identities': {
          resources: [{ id: 'id1', identity_provider_id: 'idp-1', provider_name: null }],
        },
        '/users/{user_id}/role-assignments': mockRoleAssignmentsData,
      })
      render(<UserDetail />, { wrapper })

      expect(screen.getByText('Identity Provider')).toBeInTheDocument()
    })
  })

  // ---- Group count edge cases --------------------------------------------

  describe('Group count', () => {
    it('does not add +1 for authenticated group when it is already in the list', () => {
      mockQueryByPath({
        '/users/{user_id}': mockUser,
        '/users/{user_id}/groups': mockGroupsWithAuthenticated,
        '/users/{user_id}/identities': { resources: [] },
        '/users/{user_id}/role-assignments': mockRoleAssignmentsData,
      })
      render(<UserDetail />, { wrapper })

      const groupsTab = screen.getByRole('tab', { name: /Groups/i })
      expect(groupsTab).toHaveTextContent('2')
    })

    it('adds +1 for implicit authenticated group when not in the list', () => {
      render(<UserDetail />, { wrapper })

      const groupsTab = screen.getByRole('tab', { name: /Groups/i })
      // mockGroupsData has total=1, no authenticated group -> +1 = 2
      expect(groupsTab).toHaveTextContent('2')
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
        if (path === '/users/{user_id}/identities') return emptyIdentitiesResult
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
