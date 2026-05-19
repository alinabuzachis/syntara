import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { accessClient, accessFetchClient } from './accessClient'
import { CanITab } from './CanITab'

type QueryResult = {
  data: unknown
  isPending: boolean
  error: Error | null
  refetch: ReturnType<typeof vi.fn>
}
const mockUseQuery = vi.fn<(...args: unknown[]) => QueryResult>()

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: vi.fn(),
  },
  accessFetchClient: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}))

vi.mock('./useAllUsers', () => ({
  useAllUsers: () => ({
    users: [{ id: 'u1', username: 'admin', full_name: 'Admin' }],
    isLoading: false,
    error: null,
  }),
}))

const mockCanQueryAuthz = vi.fn(() => ({ canQuery: true, isChecking: false }))
vi.mock('./useCanQueryAuthz', () => ({
  useCanQueryAuthz: () => mockCanQueryAuthz(),
}))

const mockCanILocation = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return {
    current: '/system-administration/access-management/can-i',
    listeners,
  }
})

vi.mock('wouter', async () => {
  const React = await import('react')
  return {
    useLocation: () => {
      const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)
      React.useEffect(() => {
        mockCanILocation.listeners.add(forceUpdate)
        return () => {
          mockCanILocation.listeners.delete(forceUpdate)
        }
      }, [forceUpdate])
      const setLoc = (path: string) => {
        mockCanILocation.current = path
        mockCanILocation.listeners.forEach((fn) => fn())
      }
      return [mockCanILocation.current, setLoc]
    },
    useSearchParams: () => React.useState(new URLSearchParams()),
  }
})

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

describe('CanITab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    vi.mocked(accessClient.useMutation).mockReturnValue({
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
    } as never)
    vi.mocked(accessFetchClient.GET).mockResolvedValue({ data: { resources: [] } } as never)
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { permissions: [], allowed: false } } as never)
    mockCanILocation.current = '/system-administration/access-management/can-i'
    mockCanQueryAuthz.mockReturnValue({ canQuery: true, isChecking: false })
    mockUseQuery.mockImplementation((...args: unknown[]) => {
      const [, path] = args as [string, string]
      if (path === '/authz/resource-actions') {
        return {
          data: {
            resource_actions: {
              workflow: ['read', 'write'],
              project: ['read', 'write'],
            },
          },
          isPending: false,
          error: null,
          refetch: vi.fn(),
        }
      }
      return { data: [], isPending: false, error: null, refetch: vi.fn() }
    })
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

    await waitFor(() => {
      expect(screen.getByText('No permissions')).toBeInTheDocument()
    })
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
    mockCanQueryAuthz.mockReturnValue({ canQuery: false, isChecking: false })
    render(<CanITab />, { wrapper })

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(screen.queryByRole('tab', { name: /find users who can perform an action/i })).not.toBeInTheDocument()
  })

  it('shows resource action errors without hiding the tab shell', async () => {
    const user = userEvent.setup()
    mockUseQuery.mockImplementation((...args: unknown[]) => {
      const [, path] = args as [string, string]
      if (path === '/authz/resource-actions') {
        return {
          data: undefined,
          isPending: false,
          error: new Error('Resource actions failed'),
          refetch: vi.fn(),
        }
      }
      return { data: [], isPending: false, error: null, refetch: vi.fn() }
    })

    render(<CanITab />, { wrapper })

    expect(screen.getByRole('tab', { name: /check if a user can perform an action/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /view all permissions for a user/i })).toBeInTheDocument()
    expect(screen.getByText('Error loading resource actions')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /view all permissions for a user/i }))

    await waitFor(() => {
      expect(screen.getByText('No permissions')).toBeInTheDocument()
    })
    expect(screen.queryByText('Error loading resource actions')).not.toBeInTheDocument()
  })
})
