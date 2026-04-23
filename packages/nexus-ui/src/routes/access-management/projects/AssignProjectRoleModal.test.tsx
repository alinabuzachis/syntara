import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../components/alerts'
import { accessClient } from '../../access/accessClient'
import { useAllUsers } from '../../access/useAllUsers'

import { AssignProjectRoleModal } from './AssignProjectRoleModal'

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../../access/useAllUsers', () => ({
  useAllUsers: vi.fn(),
}))

const mockMutate = vi.fn()

const mockMutationReturn = {
  mutate: mockMutate,
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
  { id: 'r1', name: 'project-admin', description: 'Project Admin', project_id: null, is_builtin: true, policies: [] },
  { id: 'r2', name: 'project-user', description: 'Project User', project_id: null, is_builtin: true, policies: [] },
  { id: 'r3', name: 'admin', description: 'Admin', project_id: null, is_builtin: true, policies: [] },
  { id: 'r4', name: 'custom-role', description: 'Custom', project_id: null, is_builtin: false, policies: [] },
]

const mockUsers = [
  { id: 'u1', username: 'alice', email: 'alice@test.com', full_name: 'Alice' },
  { id: 'u2', username: 'bob', email: 'bob@test.com', full_name: 'Bob' },
]

describe('AssignProjectRoleModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()
  const emptyAssignedRoles = new Map<string, Set<string>>()

  function setupMocks() {
    vi.mocked(useAllUsers).mockReturnValue({
      users: mockUsers as never,
      isLoading: false,
      error: null,
    })

    vi.mocked(accessClient.useQuery).mockReturnValue({
      data: { resources: mockRoles },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)

    vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  function renderModal(isOpen = true, assignedRolesByUser = emptyAssignedRoles) {
    return render(
      <AssignProjectRoleModal
        projectId="proj-1"
        isOpen={isOpen}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
        assignedRolesByUser={assignedRolesByUser}
      />,
      { wrapper }
    )
  }

  it('has no accessibility violations', async () => {
    const { container } = renderModal()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders the modal header', () => {
    renderModal()
    expect(screen.getByText('Assign role')).toBeInTheDocument()
  })

  it('renders user and role form fields', () => {
    renderModal()
    expect(screen.getByText('User')).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()
  })

  it('shows all project roles from the project endpoint', () => {
    renderModal()

    expect(screen.getByText('Role')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalledOnce()
  })
})
