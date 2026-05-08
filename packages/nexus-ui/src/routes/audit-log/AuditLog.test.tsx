import type { AuditAPI } from '@ansible/nexus-contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { auditClient } from '../../client'
import { useFilterState } from '../../hooks/useFilterState'
import { AlertProvider } from '../../providers/alerts'

import AuditLog from './AuditLog'

type AuditEventRead = AuditAPI.components['schemas']['AuditEventRead']

vi.mock('../../client', () => ({
  auditClient: {
    useQuery: vi.fn(),
  },
}))

function getLastQueryParams() {
  const lastCall = vi.mocked(auditClient.useQuery).mock.calls.at(-1)
  const options = lastCall?.[2] as { params?: { query?: Record<string, unknown> } } | undefined
  return options?.params?.query
}

const mockSetSearchParams = vi.fn()

vi.mock('wouter', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useLocation: () => ['/access-management/audit-log', vi.fn()],
    useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
  }
})

vi.mock('../../hooks/useFilterState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useFilterState')>()
  return {
    ...actual,
    useFilterState: vi.fn(actual.useFilterState),
  }
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockAuditEvents: AuditEventRead[] = [
  {
    id: 'ae-001',
    created_at: '2026-04-01T10:32:07.000Z',
    updated_at: '2026-04-01T10:32:07.000Z',
    labels: {},
    event_category: 'security_event',
    event_action: 'OIDC Login',
    event_severity: 'info',
    event_status: 'success',
    actor_id: 'user-1',
    actor_type: 'user',
    actor_username: 'jsmith',
    source_component: 'auth_service',
    resource_urn: 'urn:nexus:workflow:id=wf-001',
    resource_name: 'inventory-rollout',
    workflow_id: null,
    activity_id: null,
    execution_id: null,
    event_message: 'User authenticated via OIDC',
    structured_data: {
      data_type: 'context',
      ip_address: '192.168.1.100',
      provider: 'Keycloak',
      user_agent: 'Mozilla/5.0 Chrome/122.0',
    },
  },
  {
    id: 'ae-002',
    created_at: '2026-04-01T09:00:00.000Z',
    updated_at: '2026-04-01T09:00:00.000Z',
    labels: {},
    event_category: 'security_event',
    event_action: 'OIDC Login Failed',
    event_severity: 'warning',
    event_status: 'error',
    actor_id: null,
    actor_type: null,
    actor_username: null,
    source_component: 'auth_service',
    resource_urn: null,
    resource_name: null,
    workflow_id: null,
    activity_id: null,
    execution_id: null,
    event_message: 'Login failed',
    structured_data: {
      data_type: 'context',
      error_type: 'AuthenticationError',
      error_message: 'Invalid credentials',
    },
  },
]

function mockAuditQuery(
  overrides: Partial<{
    resources: AuditEventRead[]
    isPending: boolean
    error: unknown
    next: string | null
    prev: string | null
    total: number | null
    isFetching: boolean
  }> = {}
) {
  const {
    resources = mockAuditEvents,
    isPending = false,
    error = null,
    next = null,
    prev = null,
    total = resources.length,
    isFetching = false,
  } = overrides

  vi.mocked(auditClient.useQuery).mockReturnValue({
    data: { resources, next, prev, total },
    isPending,
    isLoading: isPending,
    isFetching,
    isError: !!error,
    error,
    refetch: vi.fn(),
  } as never)
}

describe('AuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useFilterState).mockRestore?.()
    mockAuditQuery()
  })

  // ── Rendering ──────────────────────────────────────────────────────

  it('renders page heading, table, and sortable columns', () => {
    render(<AuditLog />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Audit log table' })).toBeInTheDocument()

    const timestampHeader = screen.getByRole('columnheader', { name: /Timestamp/i })
    expect(within(timestampHeader).getByRole('button')).toBeInTheDocument()
  })

  it('renders event rows with correct data', () => {
    render(<AuditLog />, { wrapper })

    expect(screen.getAllByText('Security Event').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByText('Info')).toBeInTheDocument()

    const dataRows = screen.getAllByRole('row').filter((r) => within(r).queryByText('Security Event'))
    expect(dataRows.length).toBe(2)
  })

  it('renders User column with username or dash for null', () => {
    render(<AuditLog />, { wrapper })
    expect(screen.getByText('jsmith')).toBeInTheDocument()
    expect(screen.getAllByText('\u2014').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Resource column with resource name or dash for null', () => {
    render(<AuditLog />, { wrapper })
    expect(screen.getByRole('button', { name: 'inventory-rollout' })).toBeInTheDocument()
    expect(screen.getAllByText('\u2014').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Resource column with name only when URN is missing', () => {
    mockAuditQuery({
      resources: [
        {
          ...mockAuditEvents[0],
          id: 'ae-name-only',
          resource_urn: null,
          resource_name: 'orphaned-resource',
        },
      ],
    })

    render(<AuditLog />, { wrapper })
    expect(screen.getByText('orphaned-resource')).toBeInTheDocument()
  })

  it('renders Resource column with URN tail when name is null but URN exists', () => {
    mockAuditQuery({
      resources: [
        {
          ...mockAuditEvents[0],
          id: 'ae-urn-only',
          resource_urn: 'urn:nexus:workflow:id=42',
          resource_name: null,
        },
      ],
    })

    render(<AuditLog />, { wrapper })
    expect(screen.getByRole('button', { name: 'workflow:42' })).toBeInTheDocument()
  })

  it('renders Resource column with raw URN when format is not parseable', () => {
    mockAuditQuery({
      resources: [
        {
          ...mockAuditEvents[0],
          id: 'ae-bad-urn',
          resource_urn: 'not-a-valid-urn',
          resource_name: null,
        },
      ],
    })

    render(<AuditLog />, { wrapper })
    expect(screen.getByText('not-a-valid-urn')).toBeInTheDocument()
  })

  it('renders Resource links for all supported resource types', () => {
    const resourceTypes = [
      { urn: 'urn:nexus:execution:id=exec-1', name: 'run-1' },
      { urn: 'urn:nexus:credential:id=cred-1', name: 'my-cred' },
      { urn: 'urn:nexus:user:id=u-1', name: 'alice' },
      { urn: 'urn:nexus:group:id=g-1', name: 'admins' },
      { urn: 'urn:nexus:project:id=p-1', name: 'my-project' },
    ]

    mockAuditQuery({
      resources: resourceTypes.map((rt, i) => ({
        ...mockAuditEvents[0],
        id: `ae-type-${String(i)}`,
        resource_urn: rt.urn,
        resource_name: rt.name,
      })),
    })

    render(<AuditLog />, { wrapper })

    for (const rt of resourceTypes) {
      expect(screen.getByRole('button', { name: rt.name })).toBeInTheDocument()
    }
  })

  it('renders Resource label without link for unknown resource type', () => {
    mockAuditQuery({
      resources: [
        {
          ...mockAuditEvents[0],
          id: 'ae-unknown-type',
          resource_urn: 'urn:nexus:custom_thing:id=42',
          resource_name: null,
        },
      ],
    })

    render(<AuditLog />, { wrapper })
    expect(screen.getByText('custom_thing:42')).toBeInTheDocument()
  })

  // ── Query states ───────────────────────────────────────────────────

  it('shows loading state when query is pending', () => {
    mockAuditQuery({ resources: [], isPending: true })

    render(<AuditLog />, { wrapper })

    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('shows error state when query fails', () => {
    mockAuditQuery({ resources: [], error: { message: 'Network error' } })

    render(<AuditLog />, { wrapper })

    const errorState = screen.getByTestId('error-state')
    expect(errorState).toBeInTheDocument()
    expect(within(errorState).getByText('Network error')).toBeInTheDocument()
  })

  it('calls refetch when retry button is clicked in error state', async () => {
    const user = userEvent.setup()
    const mockRefetch = vi.fn().mockResolvedValue({})
    vi.mocked(auditClient.useQuery).mockReturnValue({
      data: { resources: [], next: null, prev: null, total: 0 },
      isPending: false,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: { message: 'Server error', status: 500 },
      refetch: mockRefetch,
    } as never)

    render(<AuditLog />, { wrapper })

    const retryButton = screen.getByRole('button', { name: /retry/i })
    await user.click(retryButton)

    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('shows empty state when no events exist', () => {
    mockAuditQuery({ resources: [] })

    render(<AuditLog />, { wrapper })

    expect(screen.getByText('No audit events found')).toBeInTheDocument()
    expect(screen.getByText('No audit events have been recorded yet.')).toBeInTheDocument()
  })

  it('shows filter empty state when no results match filters', () => {
    vi.mocked(useFilterState).mockReturnValue({
      filters: [{ key: 'event_category', operator: 'eq', value: 'security_event' }],
      setFilter: vi.fn(),
      removeFilter: vi.fn(),
      clearAllFilters: vi.fn(),
      setAllFilters: vi.fn(),
    })
    mockAuditQuery({ resources: [] })

    render(<AuditLog />, { wrapper })

    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  // ── Sorting ─────────────────────────────────────────────────────────

  it('sorts by each sortable column when header is clicked', async () => {
    const user = userEvent.setup()
    render(<AuditLog />, { wrapper })

    for (const name of ['Event', 'Actor Type', 'Resource', 'Status', 'Severity']) {
      const header = screen.getByRole('columnheader', { name: new RegExp(name, 'i') })
      await user.click(within(header).getByRole('button'))
    }

    const dataRows = screen.getAllByRole('row').filter((r) => within(r).queryByText('Security Event'))
    expect(dataRows.length).toBe(2)
  })

  // ── Interactions ───────────────────────────────────────────────────

  it('expands row to show structured details', async () => {
    const user = userEvent.setup()
    render(<AuditLog />, { wrapper })

    const expandButtons = screen.getAllByRole('button', { name: /details/i })
    await user.click(expandButtons[0])

    expect(screen.getAllByText('Event Message').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('User authenticated via OIDC')).toBeInTheDocument()
    expect(screen.getByText('OIDC Login')).toBeInTheDocument()
  })

  it('renders expanded content with object-type structured data', async () => {
    const user = userEvent.setup()
    mockAuditQuery({
      resources: [
        {
          ...mockAuditEvents[0],
          id: 'ae-obj-data',
          structured_data: {
            data_type: 'context',
            nested_field: { foo: 'bar' },
          },
        },
      ],
    })

    render(<AuditLog />, { wrapper })

    const expandButton = screen.getAllByRole('button', { name: /details/i })[0]
    await user.click(expandButton)

    expect(screen.getByText('{"foo":"bar"}')).toBeInTheDocument()
  })

  it('collapses a previously expanded row', async () => {
    const user = userEvent.setup()
    render(<AuditLog />, { wrapper })

    const expandButtons = screen.getAllByRole('button', { name: /details/i })
    await user.click(expandButtons[0])
    expect(expandButtons[0]).toHaveAttribute('aria-expanded', 'true')

    await user.click(expandButtons[0])
    expect(expandButtons[0]).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands and collapses all rows via header toggle', async () => {
    const user = userEvent.setup()
    render(<AuditLog />, { wrapper })

    expect(screen.getAllByRole('button', { name: /details/i })[0]).toHaveAttribute('aria-expanded', 'false')

    await user.click(screen.getByRole('button', { name: /expand all/i }))

    for (const btn of screen.getAllByRole('button', { name: /details/i })) {
      expect(btn).toHaveAttribute('aria-expanded', 'true')
    }

    await user.click(screen.getByRole('button', { name: /expand all/i }))

    for (const btn of screen.getAllByRole('button', { name: /details/i })) {
      expect(btn).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('shows pagination controls and navigates between pages', async () => {
    const user = userEvent.setup()
    mockAuditQuery({ next: 'next-cursor', prev: 'prev-cursor', total: 100 })

    render(<AuditLog />, { wrapper })

    const pagination = screen.getByRole('navigation', { name: /pagination/i })
    expect(pagination).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Go to next page' }))

    await waitFor(() => {
      expect(getLastQueryParams()).toMatchObject({ cursor: 'next-cursor' })
    })

    await user.click(screen.getByRole('button', { name: 'Go to previous page' }))

    await waitFor(() => {
      expect(getLastQueryParams()).toMatchObject({ cursor: 'prev-cursor' })
    })
  })

  it('passes category filter to API query when filter is active', () => {
    vi.mocked(useFilterState).mockReturnValue({
      filters: [{ key: 'event_category', operator: 'eq', value: 'security_event' }],
      setFilter: vi.fn(),
      removeFilter: vi.fn(),
      clearAllFilters: vi.fn(),
      setAllFilters: vi.fn(),
    })
    mockAuditQuery()

    render(<AuditLog />, { wrapper })

    expect(getLastQueryParams()).toMatchObject({ event_category: 'security_event' })
  })

  // ── Accessibility ──────────────────────────────────────────────────

  it('has no accessibility violations with data table', async () => {
    const { container } = render(<AuditLog />, { wrapper })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations in empty state', async () => {
    mockAuditQuery({ resources: [] })
    const { container } = render(<AuditLog />, { wrapper })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
