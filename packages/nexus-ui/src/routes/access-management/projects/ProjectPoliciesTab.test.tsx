import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../components/alerts'
import { accessClient } from '../../access/accessClient'

import { ProjectPoliciesTab } from './ProjectPoliciesTab'

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../../access/builtinFilterDefinitions', () => ({
  builtinFilterDefinitions: [],
}))

vi.mock('./EditProjectPolicyDialog', () => ({
  EditProjectPolicyDialog: () => null,
}))

vi.mock('../../../components/filters', () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}))

const mockMutationReturn = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  data: null,
  reset: vi.fn(),
  isIdle: true,
  isSuccess: false,
  failureCount: 0,
  failureReason: null,
  context: undefined,
  submittedAt: 0,
  variables: undefined,
  status: 'idle',
  isPaused: false,
} as never

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockPolicies = [
  { id: 'p1', name: 'read-policy', description: 'Read access', is_builtin: true, project_id: null },
  { id: 'p2', name: 'custom-policy', description: 'Custom policy', is_builtin: false, project_id: 'proj-1' },
]

describe('ProjectPoliciesTab', () => {
  const mockRefetch = vi.fn().mockResolvedValue({})

  function setupMocks(policies = mockPolicies) {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: { resources: policies, total: policies.length },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRefetch.mockResolvedValue({})
    setupMocks()
  })

  it('has no accessibility violations with policies', async () => {
    const { container } = render(<ProjectPoliciesTab projectId="proj-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations when empty', async () => {
    setupMocks([])
    const { container } = render(<ProjectPoliciesTab projectId="proj-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders table with policy data', () => {
    render(<ProjectPoliciesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('grid', { name: 'Project policies' })).toBeInTheDocument()
    expect(screen.getByText('read-policy')).toBeInTheDocument()
    expect(screen.getByText('custom-policy')).toBeInTheDocument()
    expect(screen.getByText('Read access')).toBeInTheDocument()
    expect(screen.getByText('Custom policy')).toBeInTheDocument()
  })

  it('shows Built-in label for built-in policies', () => {
    render(<ProjectPoliciesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('Built-in')).toBeInTheDocument()
  })

  it('shows Custom label for custom policies', () => {
    render(<ProjectPoliciesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('renders empty state when no policies exist', () => {
    setupMocks([])
    render(<ProjectPoliciesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('No policies found')).toBeInTheDocument()
  })

  it('renders error state when query fails', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Network error'),
      refetch: vi.fn(),
    } as never)

    render(<ProjectPoliciesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Error loading policies' })).toBeInTheDocument()
  })

  it('renders loading state while fetching', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    render(<ProjectPoliciesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
  })
})
