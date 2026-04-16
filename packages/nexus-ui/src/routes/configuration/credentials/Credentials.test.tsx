import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'

import Credentials from './Credentials'

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}))

const { mockSelectedProject } = vi.hoisted(() => ({
  mockSelectedProject: { current: null as { id: string; name: string } | null },
}))
const MockProjectSelector = () => <span>Mock Project Selector</span>

vi.mock('../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../../hooks/useProjectSelector', () => ({
  useProjectSelector: () => ({
    selectedProject: mockSelectedProject.current,
    isAllProjects: mockSelectedProject.current === null,
    projects: [],
    ProjectSelector: <MockProjectSelector />,
  }),
}))

vi.mock('wouter', () => ({
  useLocation: () => ['/configuration/credentials', mockNavigate],
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockCredentials = [
  {
    id: '1',
    name: 'GitHub API Token',
    description: 'Token for GitHub API access',
    credential_type_id: 'type-1',
    inputs: { token: '$encrypted$' },
    enabled: true,
    labels: {},
    created_at: '2026-03-01T05:00:00Z',
    updated_at: '2026-03-18T05:45:00Z',
  },
  {
    id: '2',
    name: 'Staging SSH',
    description: 'SSH key for staging',
    credential_type_id: 'type-2',
    inputs: { username: 'deploy', ssh_private_key: '$encrypted$' },
    enabled: false,
    labels: {},
    created_at: '2026-03-05T05:30:00Z',
    updated_at: '2026-03-05T05:30:00Z',
  },
]

const mockTypes = [
  {
    id: 'type-1',
    name: 'HTTP Bearer Token',
    description: 'Bearer token',
    inputs: { fields: [{ id: 'token', label: 'Token', type: 'string', secret: true }], required: ['token'] },
    injectors: {},
    managed: true,
  },
  { id: 'type-2', name: 'SSH Key', description: 'SSH key', inputs: {}, injectors: {}, managed: true },
]

function mockQuery(resources: typeof mockCredentials, workflowsOverride?: { data?: unknown; error?: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_method: string, path: string): any => {
    if (path === '/credentials') {
      return {
        data: { resources, next: null, prev: null, total: resources.length },
        isLoading: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      }
    }
    if (path === '/credential_types') {
      return { data: { resources: mockTypes }, isLoading: false, error: null }
    }
    if (path === '/credentials/{credential_id}/workflows') {
      return {
        data: workflowsOverride?.data ?? undefined,
        error: workflowsOverride?.error ?? null,
        isPending: false,
      }
    }
    return { data: null, isLoading: false, error: null }
  }
}

describe('Credentials', () => {
  const previousTz = process.env.TZ

  beforeAll(() => {
    // formatDate() uses local timezone; pin UTC so table date expectations are stable in CI and on developer machines.
    process.env.TZ = 'UTC'
  })

  afterAll(() => {
    if (previousTz === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = previousTz
    }
  })

  let mockMutate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockMutate = vi.fn()
    mockSelectedProject.current = { id: 'proj-1', name: 'My Project' }

    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(mockCredentials))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useMutation).mockReturnValue({ mutate: mockMutate, isPending: false } as any)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Credentials />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders the page title', () => {
    render(<Credentials />, { wrapper })
    expect(screen.getByText('Credentials')).toBeInTheDocument()
  })

  it('renders create credential button', () => {
    render(<Credentials />, { wrapper })
    expect(screen.getByRole('button', { name: 'Create credential' })).toBeInTheDocument()
  })

  it('renders credential names in the table', () => {
    render(<Credentials />, { wrapper })
    expect(screen.getByText('GitHub API Token')).toBeInTheDocument()
    expect(screen.getByText('Staging SSH')).toBeInTheDocument()
  })

  it('renders credential descriptions', () => {
    render(<Credentials />, { wrapper })
    expect(screen.getByText('Token for GitHub API access')).toBeInTheDocument()
    expect(screen.getByText('SSH key for staging')).toBeInTheDocument()
  })

  it('renders type badges', () => {
    render(<Credentials />, { wrapper })
    expect(screen.getByText('HTTP Bearer Token')).toBeInTheDocument()
    expect(screen.getByText('SSH Key')).toBeInTheDocument()
  })

  it('renders table column headers', () => {
    render(<Credentials />, { wrapper })
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Workflows')).toBeInTheDocument()
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Last modified')).toBeInTheDocument()
    expect(screen.getByText('State')).toBeInTheDocument()
  })

  it('renders empty state when no credentials exist', () => {
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery([]))
    render(<Credentials />, { wrapper })
    expect(screen.getByText('No credentials yet')).toBeInTheDocument()
  })

  it('renders footer with credential count', () => {
    render(<Credentials />, { wrapper })
    expect(screen.getByText(/2 credentials/)).toBeInTheDocument()
  })

  it('opens create modal when create button is clicked', async () => {
    const user = userEvent.setup()
    render(<Credentials />, { wrapper })
    await user.click(screen.getByRole('button', { name: 'Create credential' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders kebab actions column for each row', () => {
    const { container } = render(<Credentials />, { wrapper })
    const actionCells = container.querySelectorAll('td.pf-v6-c-table__action')
    expect(actionCells.length).toBe(2)
  })

  it('shows disable confirmation dialog when toggling enabled credential', async () => {
    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    const switches = screen.getAllByRole('switch', { name: 'Enabled' })
    await user.click(switches[0])

    expect(screen.getByText('Disable credential?')).toBeInTheDocument()
  })

  it('calls patch mutation to enable a disabled credential directly', async () => {
    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    const switches = screen.getAllByRole('switch', { name: 'Enabled' })
    await user.click(switches[1])

    expect(mockMutate).toHaveBeenCalled()
  })

  it('renders loading state', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useQuery).mockImplementation((): any => ({
      data: undefined,
      isLoading: true,
      error: null,
      isFetching: true,
    }))

    render(<Credentials />, { wrapper })
    expect(screen.getByText('Credentials')).toBeInTheDocument()
  })

  it('navigates to credential detail when row is clicked', async () => {
    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    await user.click(screen.getByText('GitHub API Token'))

    expect(mockNavigate).toHaveBeenCalledWith('/configuration/credentials/1')
  })

  it('renders formatted dates in table cells', () => {
    render(<Credentials />, { wrapper })
    expect(screen.getByText(/Mar 18, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Mar 1, 2026/)).toBeInTheDocument()
  })

  it('renders dash for workflows and last used columns', () => {
    render(<Credentials />, { wrapper })
    const dashes = screen.getAllByText('\u2014')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('renders type as dash when type not found', () => {
    const credWithUnknownType = [{ ...mockCredentials[0], credential_type_id: 'unknown-type' }]
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(credWithUnknownType))

    render(<Credentials />, { wrapper })
    const dashes = screen.getAllByText('\u2014')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('confirms disable and calls patch mutation with onSuccess', async () => {
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks.onSuccess?.()
      callbacks.onSettled?.()
    })

    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    const switches = screen.getAllByRole('switch', { name: 'Enabled' })
    await user.click(switches[0])

    expect(screen.getByText('Disable credential?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Disable' }))

    expect(mockMutate).toHaveBeenCalled()
  })

  it('handles disable mutation error', async () => {
    mockMutate.mockImplementation(
      (_args: unknown, callbacks: { onError?: (e: unknown) => void; onSettled?: () => void }) => {
        callbacks.onError?.(new Error('Server error'))
        callbacks.onSettled?.()
      }
    )

    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    const switches = screen.getAllByRole('switch', { name: 'Enabled' })
    await user.click(switches[0])
    await user.click(screen.getByRole('button', { name: 'Disable' }))

    expect(mockMutate).toHaveBeenCalled()
  })

  it('shows warning when workflow fetch fails in disable dialog', async () => {
    vi.mocked(credentialsClient.useQuery).mockImplementation(
      mockQuery(mockCredentials, { error: new Error('Network error') })
    )

    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    const switches = screen.getAllByRole('switch', { name: 'Enabled' })
    await user.click(switches[0])

    await screen.findByText('Disable credential?')
    expect(screen.getByText(/Unable to check/)).toBeInTheDocument()
  })

  it('shows affected workflows in disable dialog', async () => {
    vi.mocked(credentialsClient.useQuery).mockImplementation(
      mockQuery(mockCredentials, { data: [{ id: 'wf-1', name: 'My Workflow' }] })
    )

    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    const switches = screen.getAllByRole('switch', { name: 'Enabled' })
    await user.click(switches[0])

    await screen.findByText('My Workflow')
    expect(screen.getByText(/1 workflow/)).toBeInTheDocument()
  })

  it('enables credential directly without dialog', async () => {
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void }) => {
      callbacks.onSuccess?.()
    })

    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    const switches = screen.getAllByRole('switch', { name: 'Enabled' })
    await user.click(switches[1]) // disabled credential

    expect(mockMutate).toHaveBeenCalled()
    expect(screen.queryByText('Disable credential?')).not.toBeInTheDocument()
  })

  it('handles enable mutation error', async () => {
    mockMutate.mockImplementation((_args: unknown, callbacks: { onError?: (e: unknown) => void }) => {
      callbacks.onError?.(new Error('Failed'))
    })

    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    const switches = screen.getAllByRole('switch', { name: 'Enabled' })
    await user.click(switches[1])

    expect(mockMutate).toHaveBeenCalled()
  })

  it('closes create modal on close', async () => {
    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Create credential' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders total count when more results exist', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useQuery).mockImplementation((_method: string, path: string): any => {
      if (path === '/credentials') {
        return {
          data: { resources: mockCredentials, next: 'cursor-next', prev: null, total: 50 },
          isLoading: false,
          error: null,
          isFetching: false,
          refetch: vi.fn(),
        }
      }
      if (path === '/credential_types') {
        return { data: { resources: mockTypes }, isLoading: false, error: null }
      }
      return { data: null, isLoading: false, error: null }
    })

    render(<Credentials />, { wrapper })
    expect(screen.getByText(/of 50 total/)).toBeInTheDocument()
  })

  it('cancels disable dialog', async () => {
    const user = userEvent.setup()
    render(<Credentials />, { wrapper })

    const switches = screen.getAllByRole('switch', { name: 'Enabled' })
    await user.click(switches[0])

    expect(screen.getByText('Disable credential?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Disable credential?')).not.toBeInTheDocument()
  })

  it('opens delete dialog and confirms deletion', async () => {
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks.onSuccess?.()
      callbacks.onSettled?.()
    })

    const user = userEvent.setup()
    const { container } = render(<Credentials />, { wrapper })

    const actionCells = container.querySelectorAll('td.pf-v6-c-table__action')
    const firstKebab = actionCells[0]?.querySelector('button')
    expect(firstKebab).toBeTruthy()
    await user.click(firstKebab!)

    const deleteItem = await screen.findByText('Delete')
    await user.click(deleteItem)

    expect(screen.getByText('Delete credential')).toBeInTheDocument()
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(mockMutate).toHaveBeenCalled()
  })

  it('handles delete mutation error', async () => {
    mockMutate.mockImplementation(
      (_args: unknown, callbacks: { onError?: (e: unknown) => void; onSettled?: () => void }) => {
        callbacks.onError?.(new Error('Failed'))
        callbacks.onSettled?.()
      }
    )

    const user = userEvent.setup()
    const { container } = render(<Credentials />, { wrapper })

    const actionCells = container.querySelectorAll('td.pf-v6-c-table__action')
    const firstKebab = actionCells[0]?.querySelector('button')
    expect(firstKebab).toBeTruthy()
    await user.click(firstKebab!)

    const deleteItem = await screen.findByText('Delete')
    await user.click(deleteItem)

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(mockMutate).toHaveBeenCalled()
  })

  it('opens edit modal via kebab menu', async () => {
    const user = userEvent.setup()
    const { container } = render(<Credentials />, { wrapper })

    const actionCells = container.querySelectorAll('td.pf-v6-c-table__action')
    const firstKebab = actionCells[0]?.querySelector('button')
    expect(firstKebab).toBeTruthy()
    await user.click(firstKebab!)

    const editItem = await screen.findByText('Edit')
    await user.click(editItem)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders error state from query', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useQuery).mockImplementation((): any => ({
      data: undefined,
      isLoading: false,
      error: new Error('Server error'),
      isError: true,
      isFetching: false,
    }))

    render(<Credentials />, { wrapper })
    expect(screen.getByText('Credentials')).toBeInTheDocument()
  })

  it('renders project switcher in the header', () => {
    render(<Credentials />, { wrapper })
    expect(screen.getByText('Mock Project Selector')).toBeInTheDocument()
  })

  it('disables create credential button when no project is selected', () => {
    mockSelectedProject.current = null
    render(<Credentials />, { wrapper })
    expect(screen.getByRole('button', { name: 'Create credential' })).toBeDisabled()
  })

  it('enables create credential button when a project is selected', () => {
    mockSelectedProject.current = { id: 'proj-1', name: 'My Project' }
    render(<Credentials />, { wrapper })
    expect(screen.getByRole('button', { name: 'Create credential' })).toBeEnabled()
  })

  it('includes project_id in query params when project is selected', () => {
    mockSelectedProject.current = { id: 'proj-1', name: 'My Project' }
    render(<Credentials />, { wrapper })

    // The credentialsClient.useQuery for /credentials should have been called with project_id
    const calls = vi.mocked(credentialsClient.useQuery).mock.calls
    const credentialsCalls = calls.filter((c) => c[1] === '/credentials')
    expect(credentialsCalls.length).toBeGreaterThan(0)
    const lastCall = credentialsCalls[credentialsCalls.length - 1]
    const queryParams = (lastCall[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params?.query
    expect(queryParams).toHaveProperty('project_id', 'proj-1')
  })

  it('does not include project_id in query params when all projects mode is active', () => {
    mockSelectedProject.current = null
    render(<Credentials />, { wrapper })

    const calls = vi.mocked(credentialsClient.useQuery).mock.calls
    const credentialsCalls = calls.filter((c) => c[1] === '/credentials')
    expect(credentialsCalls.length).toBeGreaterThan(0)
    const lastCall = credentialsCalls[credentialsCalls.length - 1]
    const queryParams = (lastCall[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params?.query
    expect(queryParams).not.toHaveProperty('project_id')
  })
})
