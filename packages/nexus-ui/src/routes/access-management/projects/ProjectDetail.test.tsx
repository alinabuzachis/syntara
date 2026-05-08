import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../providers/alerts'
import { accessClient } from '../../access/accessClient'

import { ProjectDetail } from './ProjectDetail'

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('wouter', () => ({
  useParams: () => ({ projectId: 'proj-1' }),
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

vi.mock('../../../hooks/useDetailTab', () => ({
  useDetailTab: () => ['details', vi.fn()],
}))

vi.mock('./ProjectRoleAssignmentsTab', () => ({
  ProjectRoleAssignmentsTab: () => <div>Mock Role Assignments Tab</div>,
}))

vi.mock('./ProjectRolesTab', () => ({
  ProjectRolesTab: () => <div>Mock Roles Tab</div>,
}))

vi.mock('./ProjectPoliciesTab', () => ({
  ProjectPoliciesTab: () => <div>Mock Policies Tab</div>,
}))

vi.mock('./ProjectNotFoundState', () => ({
  ProjectNotFoundState: ({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) => (
    <div>
      <span>Project not found</span>
      <button type="button" onClick={onBack}>
        Back to projects
      </button>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  ),
}))

vi.mock('../../../utils/dateUtils', () => ({
  formatDateTime: (v: string | null | undefined) => v ?? 'N/A',
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockProject = {
  id: 'proj-1',
  name: 'Alpha Project',
  description: 'Test project',
  is_default: false,
  labels: { env: 'prod' },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
}

describe('ProjectDetail', () => {
  const mockRefetch = vi.fn().mockResolvedValue({})

  function setupMocks(project = mockProject) {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: project,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRefetch.mockResolvedValue({})
    setupMocks()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ProjectDetail />, { wrapper })
    // PF6 Tabs generates aria-controls referencing tab panel IDs that jsdom
    // does not render (lazy panels), causing a false-positive violation.
    const results = await axe(container, {
      rules: { 'aria-valid-attr-value': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('renders project name as heading', () => {
    render(<ProjectDetail />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Alpha Project' })).toBeInTheDocument()
  })

  it('renders Details tab content with description', () => {
    render(<ProjectDetail />, { wrapper })

    expect(screen.getByText('Test project')).toBeInTheDocument()
  })

  it('renders labels in Details tab', () => {
    render(<ProjectDetail />, { wrapper })

    expect(screen.getByText('env: prod')).toBeInTheDocument()
  })

  it('renders tab navigation buttons', () => {
    render(<ProjectDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Role Assignments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Roles' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Policies' })).toBeInTheDocument()
  })

  it('shows not-found state when query has an error', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Not found'),
      refetch: mockRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    expect(screen.getByText('Project not found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to projects' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders loading state while data is pending', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    expect(screen.queryByRole('heading', { name: 'Alpha Project' })).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
  })
})
