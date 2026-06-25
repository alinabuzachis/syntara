import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { CheckAccessTab } from './CheckAccessTab'

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
    useMutation: vi.fn(() => ({
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
    })),
  },
  accessFetchClient: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}))

vi.mock('./useAllUsers', () => ({
  useAllUsers: () => ({
    users: [{ id: 'u1', username: 'admin', first_name: 'Admin' }],
    isLoading: false,
    error: null,
  }),
}))

vi.mock('../../hooks/routing/useLocation', () => ({
  useLocation: () => '/system-administration/access-management/check-access',
}))

vi.mock('../../hooks/routing/useNavigate', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../hooks/routing/useSearchParams', async () => {
  const React = await import('react')
  return {
    useSearchParams: () => React.useState(new URLSearchParams()),
  }
})

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

describe('CheckAccessTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    mockUseQuery.mockImplementation((...args: unknown[]) => {
      const [, path] = args as [string, string]
      if (path === '/authz/resource_actions') {
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

  it('renders the description text', () => {
    render(<CheckAccessTab />, { wrapper })

    expect(screen.getByText(/look up which users and groups have access/i)).toBeInTheDocument()
  })

  it('renders the Who Can view with resource types', () => {
    render(<CheckAccessTab />, { wrapper })

    expect(screen.getByText('Find who has access')).toBeInTheDocument()
  })

  it('shows error state when resource actions fail to load', () => {
    mockUseQuery.mockImplementation((...args: unknown[]) => {
      const [, path] = args as [string, string]
      if (path === '/authz/resource_actions') {
        return {
          data: undefined,
          isPending: false,
          error: new Error('Resource actions failed'),
          refetch: vi.fn(),
        }
      }
      return { data: [], isPending: false, error: null, refetch: vi.fn() }
    })

    render(<CheckAccessTab />, { wrapper })

    expect(screen.getByText('Error loading resource actions')).toBeInTheDocument()
  })
})
