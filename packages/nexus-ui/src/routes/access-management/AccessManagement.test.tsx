import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AppRoute } from '../../app/AppRoute'
import { usersClient } from '../../client'
import { AlertProvider } from '../../providers/alerts'
import { accessClient, accessFetchClient } from '../access/accessClient'

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
const wouterLocation = { path: AppRoute.AccessManagement.Users }

vi.mock('wouter', () => ({
  useLocation: () => [wouterLocation.path, mockNavigate],
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useSearch: () => '',
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

vi.mock('../../client', () => ({
  usersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  accessFetchClient: {
    POST: vi.fn(),
  },
}))

describe('AccessManagement', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.mocked(usersClient.useQuery).mockReturnValue({
      data: { resources: [] },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
    vi.mocked(usersClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: { resources: [] },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
    vi.mocked(accessClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } } as never)
    wouterLocation.path = AppRoute.AccessManagement.Users
    mockNavigate.mockClear()
  })

  async function renderAndSettle(ui: React.ReactElement) {
    const view = render(ui, { wrapper })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Access Management' })).toBeInTheDocument()
      expect(screen.queryAllByRole('tab').length).toBeGreaterThan(0)
    })
    return view
  }

  it('renders the page header', async () => {
    await renderAndSettle(<AccessManagement />)

    expect(screen.getByRole('heading', { name: 'Access Management' })).toBeInTheDocument()
  })

  it('renders all expected tabs', async () => {
    await renderAndSettle(<AccessManagement />)

    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Groups' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Policies' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Roles' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Assignments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Can I?' })).toBeInTheDocument()
  })

  it('does not render Identity Providers or Claim Mappings tabs', async () => {
    await renderAndSettle(<AccessManagement />)

    expect(screen.queryByRole('tab', { name: 'Identity Providers' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Claim Mappings' })).not.toBeInTheDocument()
  })

  it('defaults to Users tab', async () => {
    await renderAndSettle(<AccessManagement />)

    expect(screen.getByText('No users')).toBeInTheDocument()
  })

  it('replaces bare /system-administration/access-management with the Users tab URL', async () => {
    wouterLocation.path = AppRoute.AccessManagement.Root
    await renderAndSettle(<AccessManagement />)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(AppRoute.AccessManagement.Users, { replace: true })
    })
  })

  it('renders breadcrumbs on all tabs including Users', async () => {
    await renderAndSettle(<AccessManagement />)

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
  })

  it('renders breadcrumbs on non-default hub tabs', async () => {
    wouterLocation.path = AppRoute.AccessManagement.Groups
    await renderAndSettle(<AccessManagement />)

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Access management' })).toBeInTheDocument()
  })

  it('defaults to first tab when location does not match any tab path', async () => {
    wouterLocation.path = '/access-management/unknown-path'
    await renderAndSettle(<AccessManagement />)

    expect(screen.getByText('No users')).toBeInTheDocument()
  })

  it('navigates to Groups tab when clicked', async () => {
    const user = userEvent.setup()
    await renderAndSettle(<AccessManagement />)

    await user.click(screen.getByRole('tab', { name: 'Groups' }))

    expect(mockNavigate).toHaveBeenCalledWith(AppRoute.AccessManagement.Groups)
  })

  it('hides Users tab when user lacks user:read permission', async () => {
    vi.mocked(accessFetchClient.POST).mockImplementation((_path: string, options: never) => {
      const { body } = options as { body: { resource_type: string } }
      if (body.resource_type === 'user') return Promise.resolve({ data: { allowed: false } } as never)
      return Promise.resolve({ data: { allowed: true } } as never)
    })
    wouterLocation.path = AppRoute.AccessManagement.Groups
    await renderAndSettle(<AccessManagement />)

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Users' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Groups' })).toBeInTheDocument()
  })

  it('hides Groups tab when user lacks group:read permission', async () => {
    vi.mocked(accessFetchClient.POST).mockImplementation((_path: string, options: never) => {
      const { body } = options as { body: { resource_type: string } }
      if (body.resource_type === 'group') return Promise.resolve({ data: { allowed: false } } as never)
      return Promise.resolve({ data: { allowed: true } } as never)
    })
    await renderAndSettle(<AccessManagement />)

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Groups' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument()
  })

  it('redirects to first allowed tab when navigating to a restricted path', async () => {
    vi.mocked(accessFetchClient.POST).mockImplementation((_path: string, options: never) => {
      const { body } = options as { body: { resource_type: string } }
      if (body.resource_type === 'user') return Promise.resolve({ data: { allowed: false } } as never)
      return Promise.resolve({ data: { allowed: true } } as never)
    })
    wouterLocation.path = AppRoute.AccessManagement.Users
    await renderAndSettle(<AccessManagement />)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(AppRoute.AccessManagement.Groups, { replace: true })
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = await renderAndSettle(<AccessManagement />)

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

  describe('no access', () => {
    it('shows access denied when user lacks all AM permissions', async () => {
      vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: false } } as never)

      render(<AccessManagement />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Access denied')).toBeInTheDocument()
      })
      expect(screen.getByRole('heading', { name: 'Access Management' })).toBeInTheDocument()
      expect(screen.getByText(/You don't have permission to view access management/)).toBeInTheDocument()
      expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    })

    it('has no accessibility violations in access denied state', async () => {
      vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: false } } as never)

      const { container } = render(<AccessManagement />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Access denied')).toBeInTheDocument()
      })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
