import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../components/alerts'
import { accessClient } from '../../access/accessClient'
import { useAllRoles } from '../../access/useAllRoles'
import { useAllUsers } from '../../access/useAllUsers'

import { ProjectPermissionsTab } from './ProjectPermissionsTab'

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../../access/useAllRoles', () => ({
  useAllRoles: vi.fn(),
}))

vi.mock('../../access/useAllUsers', () => ({
  useAllUsers: vi.fn(),
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

const mockAssignments = [
  {
    id: 'a1',
    user_id: 'u1',
    username: 'alice',
    project_id: 'proj-1',
    role_id: 'r1',
    role_name: 'project-admin',
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'a2',
    user_id: 'u2',
    username: 'bob',
    project_id: 'proj-1',
    role_id: 'r2',
    role_name: 'project-user',
    created_at: '2024-02-01T12:30:00Z',
  },
]

describe('ProjectPermissionsTab', () => {
  function setupMocks(assignments = mockAssignments) {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: assignments,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn().mockResolvedValue({}),
    } as never)

    vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn)

    vi.mocked(useAllRoles).mockReturnValue({
      roles: [] as never,
      isLoading: false,
      error: null,
    })

    vi.mocked(useAllUsers).mockReturnValue({
      users: [] as never,
      isLoading: false,
      error: null,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('has no accessibility violations with assignments', async () => {
    const { container } = render(<ProjectPermissionsTab projectId="proj-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations when empty', async () => {
    setupMocks([])
    const { container } = render(<ProjectPermissionsTab projectId="proj-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders the permissions table with assignments', () => {
    render(<ProjectPermissionsTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('project-admin')).toBeInTheDocument()
    expect(screen.getByText('project-user')).toBeInTheDocument()
  })

  it('renders empty state when no assignments exist', () => {
    setupMocks([])
    render(<ProjectPermissionsTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('No permissions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign role' })).toBeInTheDocument()
  })

  it('renders error state when query fails', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Network error'),
      refetch: vi.fn(),
    } as never)

    render(<ProjectPermissionsTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('Error loading permissions')).toBeInTheDocument()
  })

  it('renders loading state while fetching', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    render(<ProjectPermissionsTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
  })
})
