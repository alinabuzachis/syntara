import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const mockUseParams = vi.fn(() => ({ projectId: 'proj-1' }))
vi.mock('wouter', () => ({
  useParams: () => mockUseParams(),
  useLocation: () => ['/system-administration/access-management/projects/proj-1/details', vi.fn()],
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

const mockGoToTab = vi.fn()
const mockDetailTab = vi.fn(() => ['details', mockGoToTab])
vi.mock('../../../hooks/useUrlTab', () => ({
  useUrlTab: () => mockDetailTab(),
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
    mockDetailTab.mockReturnValue(['details', mockGoToTab])
    mockUseParams.mockReturnValue({ projectId: 'proj-1' })
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

  it('renders nothing when data is undefined with no error and not pending', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    const { container } = render(<ProjectDetail />, { wrapper })

    expect(container.firstChild).toBeNull()
  })

  it('renders "-" for labels when project has no labels', () => {
    const projectNoLabels = { ...mockProject, labels: {} }
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: projectNoLabels,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
  })

  it('calls refetchProject when retry is clicked in not-found state', async () => {
    const user = userEvent.setup()
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Not found'),
      refetch: mockRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(mockRefetch).toHaveBeenCalled()
  })

  it('calls navigate when back button is clicked in not-found state', async () => {
    const { navigate } = await import('wouter/use-browser-location')
    const user = userEvent.setup()
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Not found'),
      refetch: mockRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Back to projects' }))

    expect(navigate).toHaveBeenCalled()
  })

  it('renders "-" for description when project has no description', () => {
    const projectNoDesc = { ...mockProject, description: null }
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: projectNoDesc,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    expect(screen.getByText('Description')).toBeInTheDocument()
    // When description is null, the ?? fallback shows '-'
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('renders the Role Assignments tab content', () => {
    mockDetailTab.mockReturnValue(['role-assignments', mockGoToTab])
    render(<ProjectDetail />, { wrapper })

    expect(screen.getByText('Mock Role Assignments Tab')).toBeInTheDocument()
  })

  it('renders the Roles tab content', () => {
    mockDetailTab.mockReturnValue(['roles', mockGoToTab])
    render(<ProjectDetail />, { wrapper })

    expect(screen.getByText('Mock Roles Tab')).toBeInTheDocument()
  })

  it('renders the Policies tab content', () => {
    mockDetailTab.mockReturnValue(['policies', mockGoToTab])
    render(<ProjectDetail />, { wrapper })

    expect(screen.getByText('Mock Policies Tab')).toBeInTheDocument()
  })

  it('calls goToTab when a tab is clicked', async () => {
    const user = userEvent.setup()
    render(<ProjectDetail />, { wrapper })

    await user.click(screen.getByRole('tab', { name: 'Role Assignments' }))

    expect(mockGoToTab).toHaveBeenCalledWith('role-assignments')
  })

  it('handles refetch rejection gracefully in onRetry callback', async () => {
    const user = userEvent.setup()
    const rejectingRefetch = vi.fn().mockRejectedValue(new Error('Refetch failed'))
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
      isError: true,
      error: { message: 'Not found', retryable: true },
      refetch: rejectingRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    // Click retry in the queryState error (not the not-found state)
    // With isError=true AND error being set, projectQuery.error branch is taken
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(rejectingRefetch).toHaveBeenCalled()
  })

  it('handles refetch rejection in not-found state onRetry', async () => {
    const user = userEvent.setup()
    const rejectingRefetch = vi.fn().mockRejectedValue(new Error('Refetch failed'))
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
      isError: true,
      error: new Error('Not found'),
      refetch: rejectingRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(rejectingRefetch).toHaveBeenCalled()
  })

  it('renders with undefined projectId gracefully', () => {
    mockUseParams.mockReturnValue({ projectId: undefined as unknown as string })
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    const { container } = render(<ProjectDetail />, { wrapper })

    // With no projectId, data is undefined and no error → returns null
    expect(container.firstChild).toBeNull()
  })

  it('renders "-" for labels when labels is undefined', () => {
    const projectUndefinedLabels = { ...mockProject, labels: undefined as unknown as Record<string, unknown> }
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: projectUndefinedLabels,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    // When labels is undefined, the ?? {} fallback is used → empty labels → shows '-'
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('renders Default label when project is_default', () => {
    const defaultProject = { ...mockProject, is_default: true }
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: defaultProject,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as never)

    render(<ProjectDetail />, { wrapper })

    expect(screen.getByText('Default')).toBeInTheDocument()
  })
})
