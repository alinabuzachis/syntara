import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../components/alerts'
import { accessClient } from '../../access/accessClient'

import { ProjectRolesTab } from './ProjectRolesTab'

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

vi.mock('./AddProjectRoleDialog', () => ({
  AddProjectRoleDialog: () => null,
}))

vi.mock('./EditProjectRoleDialog', () => ({
  EditProjectRoleDialog: () => null,
}))

vi.mock('../../../components/filters', () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}))

const mockDeleteMutate = vi.fn()

const mockMutationReturn = {
  mutate: mockDeleteMutate,
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

const mockRoles = [
  { id: 'r1', name: 'project-admin', description: 'Admin role', policies: ['read', 'write'], is_builtin: true },
  { id: 'r2', name: 'custom-editor', description: 'Editor', policies: ['read'], is_builtin: false },
]

describe('ProjectRolesTab', () => {
  const mockRefetch = vi.fn().mockResolvedValue({})

  function setupMocks(roles = mockRoles) {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: { resources: roles, total: roles.length },
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

  it('has no accessibility violations with roles', async () => {
    const { container } = render(<ProjectRolesTab projectId="proj-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations when empty', async () => {
    setupMocks([])
    const { container } = render(<ProjectRolesTab projectId="proj-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders table with role data', () => {
    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('grid', { name: 'Project roles' })).toBeInTheDocument()
    expect(screen.getByText('project-admin')).toBeInTheDocument()
    expect(screen.getByText('custom-editor')).toBeInTheDocument()
    expect(screen.getByText('Admin role')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })

  it('shows policies as labels', () => {
    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    // 'read' appears in both the built-in and custom role rows
    expect(screen.getAllByText('read')).toHaveLength(2)
    expect(screen.getByText('write')).toBeInTheDocument()
  })

  it('shows Built-in label for built-in roles', () => {
    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('Built-in')).toBeInTheDocument()
  })

  it('shows Custom label for custom roles', () => {
    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('renders "Add role" button', () => {
    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('button', { name: 'Add role' })).toBeInTheDocument()
  })

  it('renders empty state when no roles exist', () => {
    setupMocks([])
    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByText('No roles found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add role' })).toBeInTheDocument()
  })

  it('renders error state when query fails', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Network error'),
      refetch: vi.fn(),
    } as never)

    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Error loading roles' })).toBeInTheDocument()
  })

  it('renders loading state while fetching', () => {
    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
  })

  it('calls showSuccess on successful delete', async () => {
    const user = userEvent.setup()
    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    const kebabButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
    await user.click(kebabButtons[0])

    const deleteItem = await screen.findByText('Delete role')
    await user.click(deleteItem)

    const confirmButton = await screen.findByRole('button', { name: 'Delete' })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalled()
    })

    const callbacks = mockDeleteMutate.mock.calls[0][1] as { onSuccess: () => void; onSettled: () => void }
    act(() => {
      callbacks.onSuccess()
      callbacks.onSettled()
    })

    expect(mockRefetch).toHaveBeenCalled()
  })

  it('calls showError on failed delete', async () => {
    const user = userEvent.setup()
    render(<ProjectRolesTab projectId="proj-1" />, { wrapper })

    const kebabButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
    await user.click(kebabButtons[0])

    const deleteItem = await screen.findByText('Delete role')
    await user.click(deleteItem)

    const confirmButton = await screen.findByRole('button', { name: 'Delete' })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalled()
    })

    const callbacks = mockDeleteMutate.mock.calls[0][1] as { onError: (error: unknown) => void; onSettled: () => void }
    act(() => {
      callbacks.onError(new Error('Server error'))
      callbacks.onSettled()
    })

    expect(mockRefetch).not.toHaveBeenCalled()
  })
})
