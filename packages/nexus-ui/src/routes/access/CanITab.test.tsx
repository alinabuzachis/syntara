import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { CanITab } from './CanITab'

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: vi.fn().mockImplementation((_method: string, path: string) => {
      if (path === '/policies') {
        return {
          data: {
            resources: [
              {
                id: 'p1',
                name: 'admin-policy',
                description: 'Admin policy',
                statements: [{ scope: 'any', effect: 'allow', actions: ['workflow:read', 'project:write'] }],
                is_builtin: true,
                project_id: null,
                labels: {},
                created_at: null,
                updated_at: null,
              },
            ],
          },
          isPending: false,
          error: null,
        }
      }
      // /projects returns an array directly
      return { data: [], isPending: false, error: null }
    }),
    useMutation: vi.fn().mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      isIdle: true,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
      reset: vi.fn(),
      status: 'idle',
      failureCount: 0,
      failureReason: null,
      context: undefined,
      submittedAt: 0,
      variables: undefined,
      isPaused: false,
    }),
  },
  accessFetchClient: {
    GET: vi.fn().mockResolvedValue({ data: { resources: [] }, error: null }),
    POST: vi.fn().mockResolvedValue({ data: { allowed: false }, error: null }),
  },
}))

vi.mock('./useAllUsers', () => ({
  useAllUsers: () => ({
    users: [{ id: 'u1', username: 'admin', full_name: 'Admin' }],
    isLoading: false,
    error: null,
  }),
}))

const mockCanQueryAuthz = vi.fn(() => true)
vi.mock('./useCanQueryAuthz', () => ({
  useCanQueryAuthz: () => mockCanQueryAuthz(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

describe('CanITab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('renders all three sub-tabs', () => {
    render(<CanITab />, { wrapper })

    expect(screen.getByRole('tab', { name: /check if a user can perform an action/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /find users who can perform an action/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /view all permissions for a user/i })).toBeInTheDocument()
  })

  it('shows Check Access view by default', () => {
    render(<CanITab />, { wrapper })

    // The CheckAccessView should display the empty state initially
    expect(screen.getByText('Check access permissions')).toBeInTheDocument()
  })

  it('switches to Who Can tab on click', async () => {
    const user = userEvent.setup()
    render(<CanITab />, { wrapper })

    await user.click(screen.getByRole('tab', { name: /find users who can perform an action/i }))

    expect(screen.getByText('Find who has access')).toBeInTheDocument()
  })

  it('switches to My Permissions tab on click', async () => {
    const user = userEvent.setup()
    render(<CanITab />, { wrapper })

    await user.click(screen.getByRole('tab', { name: /view all permissions for a user/i }))

    expect(screen.getByText('View all permissions')).toBeInTheDocument()
  })

  it('renders proper ARIA attributes on tabs', () => {
    render(<CanITab />, { wrapper })

    // Verify tab roles are present (3 when permission is granted)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)

    // The first tab should be selected by default
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')

    // Each tab has an accessible label
    expect(tabs[0]).toHaveAttribute('aria-label', 'Check if a user can perform an action')
    expect(tabs[1]).toHaveAttribute('aria-label', 'Find users who can perform an action')
    expect(tabs[2]).toHaveAttribute('aria-label', 'View all permissions for a user')
  })

  it('hides Who Can tab when user lacks authz query permission', () => {
    mockCanQueryAuthz.mockReturnValue(false)
    render(<CanITab />, { wrapper })

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(screen.queryByRole('tab', { name: /find users who can perform an action/i })).not.toBeInTheDocument()
  })
})
