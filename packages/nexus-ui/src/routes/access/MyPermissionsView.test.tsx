import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { accessFetchClient } from './accessClient'
import { MyPermissionsView } from './MyPermissionsView'

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
  },
  accessFetchClient: {
    GET: vi.fn().mockResolvedValue({ data: { resources: [] }, error: null }),
    POST: vi.fn().mockResolvedValue({
      data: { permissions: [] },
      error: null,
    }),
  },
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

const samplePermissions = [
  {
    policy_name: 'admin-policy',
    effect: 'allow',
    actions: ['workflow:read', 'workflow:write'],
    scope: '*',
    project: 'default',
  },
  {
    policy_name: 'deny-delete',
    effect: 'deny',
    actions: ['workflow:delete'],
    scope: 'project',
    project: 'production',
  },
]

describe('MyPermissionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('renders empty state initially', () => {
    render(<MyPermissionsView />, { wrapper })

    expect(screen.getByText('View all permissions')).toBeInTheDocument()
    expect(
      screen.getByText('Click Load Permissions to see everything the current user is allowed to do.')
    ).toBeInTheDocument()
  })

  it('renders Load Permissions button', () => {
    render(<MyPermissionsView />, { wrapper })

    expect(screen.getByRole('button', { name: 'Load Permissions' })).toBeInTheDocument()
  })

  it('shows "current user" text', () => {
    render(<MyPermissionsView />, { wrapper })

    expect(screen.getByText('Showing permissions for current user')).toBeInTheDocument()
  })

  it('loads and displays permissions table', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockResolvedValueOnce({
      data: { permissions: samplePermissions },
      error: undefined,
      response: new Response(),
    })

    render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    await waitFor(() => {
      expect(screen.getByText('admin-policy')).toBeInTheDocument()
    })

    expect(screen.getByText('deny-delete')).toBeInTheDocument()
    expect(screen.getByText('allow')).toBeInTheDocument()
    expect(screen.getByText('deny')).toBeInTheDocument()
    expect(screen.getByText('workflow:read')).toBeInTheDocument()
    expect(screen.getByText('workflow:write')).toBeInTheDocument()
    expect(screen.getByText('workflow:delete')).toBeInTheDocument()
    expect(screen.getByText('2 of 2 permissions')).toBeInTheDocument()
  })

  it('changes button text to Refresh after loading', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockResolvedValueOnce({
      data: { permissions: samplePermissions },
      error: undefined,
      response: new Response(),
    })

    render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    })
  })

  it('filters permissions by text', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockResolvedValueOnce({
      data: { permissions: samplePermissions },
      error: undefined,
      response: new Response(),
    })

    render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    await waitFor(() => {
      expect(screen.getByText('2 of 2 permissions')).toBeInTheDocument()
    })

    const filterInput = screen.getByRole('textbox', { name: 'Filter permissions' })
    await user.type(filterInput, 'deny')

    expect(screen.getByText('1 of 2 permissions')).toBeInTheDocument()
    expect(screen.getByText('deny-delete')).toBeInTheDocument()
  })

  it('filters by action', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockResolvedValueOnce({
      data: { permissions: samplePermissions },
      error: undefined,
      response: new Response(),
    })

    render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    await waitFor(() => {
      expect(screen.getByText('2 of 2 permissions')).toBeInTheDocument()
    })

    const filterInput = screen.getByRole('textbox', { name: 'Filter permissions' })
    await user.type(filterInput, 'delete')

    expect(screen.getByText('1 of 2 permissions')).toBeInTheDocument()
  })

  it('filters by project', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockResolvedValueOnce({
      data: { permissions: samplePermissions },
      error: undefined,
      response: new Response(),
    })

    render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    await waitFor(() => {
      expect(screen.getByText('2 of 2 permissions')).toBeInTheDocument()
    })

    const filterInput = screen.getByRole('textbox', { name: 'Filter permissions' })
    await user.type(filterInput, 'production')

    expect(screen.getByText('1 of 2 permissions')).toBeInTheDocument()
    expect(screen.getByText('deny-delete')).toBeInTheDocument()
  })

  it('shows error alert on API failure', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockResolvedValueOnce({
      data: undefined,
      error: { detail: 'Internal server error' },
      response: new Response(),
    })

    render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to load permissions')).toBeInTheDocument()
    })
  })

  it('shows spinner while loading', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockReturnValueOnce(new Promise(() => {}))

    render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    expect(screen.getByRole('progressbar', { name: 'Loading permissions' })).toBeInTheDocument()
  })

  it('shows dash for empty scope and project', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockResolvedValueOnce({
      data: {
        permissions: [
          {
            policy_name: 'test',
            effect: 'allow',
            actions: ['workflow:read'],
            scope: '',
            project: '',
          },
        ],
      },
      error: undefined,
      response: new Response(),
    })

    render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    await waitFor(() => {
      expect(screen.getByText('test')).toBeInTheDocument()
    })

    // Empty scope/project should show '-'
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('shows singular "permission" for single result', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockResolvedValueOnce({
      data: {
        permissions: [
          {
            policy_name: 'single',
            effect: 'allow',
            actions: ['workflow:read'],
            scope: '*',
            project: 'default',
          },
        ],
      },
      error: undefined,
      response: new Response(),
    })

    render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    await waitFor(() => {
      expect(screen.getByText('1 of 1 permission')).toBeInTheDocument()
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MyPermissionsView />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with permissions loaded', async () => {
    const user = userEvent.setup()

    vi.mocked(accessFetchClient.POST).mockResolvedValueOnce({
      data: { permissions: samplePermissions },
      error: undefined,
      response: new Response(),
    })

    const { container } = render(<MyPermissionsView />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Load Permissions' }))

    await waitFor(() => {
      expect(screen.getByText('admin-policy')).toBeInTheDocument()
    })

    let results: Awaited<ReturnType<typeof axe>>
    await act(async () => {
      results = await axe(container)
    })
    expect(results!).toHaveNoViolations()
  })
})
