import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../components/alerts'

import { AccessManagement } from './AccessManagement'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockNavigate = vi.fn()
vi.mock('wouter', () => ({
  useLocation: () => ['/access-management/users', mockNavigate],
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

vi.mock('../../client', () => ({
  usersClient: {
    useQuery: vi.fn().mockReturnValue({
      data: { resources: [] },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useMutation: vi.fn().mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    }),
  },
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn().mockReturnValue({
      data: { resources: [] },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useMutation: vi.fn().mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    }),
  },
  accessFetchClient: {
    POST: vi.fn().mockResolvedValue({ data: { allowed: false } }),
  },
}))

describe('AccessManagement', () => {
  it('renders the page header', () => {
    render(<AccessManagement />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Access Management' })).toBeInTheDocument()
  })

  it('renders all expected tabs', () => {
    render(<AccessManagement />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Groups' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Policies' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Roles' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Role Assignments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Can I?' })).toBeInTheDocument()
  })

  it('does not render Identity Providers or Claim Mappings tabs', () => {
    render(<AccessManagement />, { wrapper })

    expect(screen.queryByRole('tab', { name: 'Identity Providers' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Claim Mappings' })).not.toBeInTheDocument()
  })

  it('defaults to Users tab', () => {
    render(<AccessManagement />, { wrapper })

    // Users tab should be selected by default (empty state shows "No users")
    expect(screen.getByText('No users')).toBeInTheDocument()
  })

  it('navigates to Groups tab when clicked', async () => {
    const user = userEvent.setup()
    render(<AccessManagement />, { wrapper })

    await user.click(screen.getByRole('tab', { name: 'Groups' }))

    expect(mockNavigate).toHaveBeenCalledWith('/access-management/groups')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<AccessManagement />, { wrapper })

    // Wrap axe in act() -- axe triggers DOM events (focus, scroll) that
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
})
