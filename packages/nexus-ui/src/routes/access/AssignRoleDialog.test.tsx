import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../components/alerts'

import { accessClient } from './accessClient'
import { AssignRoleDialog } from './AssignRoleDialog'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  accessFetchClient: {
    GET: vi.fn().mockResolvedValue({ data: { resources: [] }, error: null }),
    use: vi.fn(),
  },
}))

vi.mock('./useAllUsers', () => ({
  useAllUsers: vi.fn().mockReturnValue({
    users: [
      { id: 'u1', username: 'alice', email: 'alice@test.com', full_name: 'Alice' },
      { id: 'u2', username: 'bob', email: 'bob@test.com', full_name: 'Bob' },
    ],
    isLoading: false,
    error: null,
  }),
}))

vi.mock('./useAllRoles', () => ({
  useAllRoles: vi.fn().mockReturnValue({
    roles: [
      {
        id: 'r1',
        name: 'Admin',
        description: null,
        policies: [],
        is_builtin: true,
        is_system_scoped: true,
        project_id: null,
        labels: {},
        created_at: null,
        updated_at: null,
      },
      {
        id: 'r2',
        name: 'Viewer',
        description: null,
        policies: [],
        is_builtin: true,
        is_system_scoped: true,
        project_id: null,
        labels: {},
        created_at: null,
        updated_at: null,
      },
      {
        id: 'r3',
        name: 'ProjectAdmin',
        description: null,
        policies: [],
        is_builtin: true,
        is_system_scoped: false,
        project_id: 'p1',
        labels: {},
        created_at: null,
        updated_at: null,
      },
    ],
    isLoading: false,
    error: null,
  }),
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

// ── Test data ────────────────────────────────────────────────────────────────

const mockProjects = [
  {
    id: 'p1',
    name: 'Project Alpha',
    description: null,
    labels: {},
    is_default: true,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'p2',
    name: 'Project Beta',
    description: null,
    labels: {},
    is_default: false,
    created_at: null,
    updated_at: null,
  },
]

const mockMutationReturn = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
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
  status: 'idle' as const,
  isPaused: false,
}

function setupDefaultMocks() {
  vi.mocked(accessClient.useQuery).mockImplementation((_method: string, path: string) => {
    if (path === '/projects') {
      return {
        data: mockProjects,
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never
    }
    return {
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never
  })
  vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn as never)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AssignRoleDialog', () => {
  const defaultProps = {
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  describe('Rendering', () => {
    it('renders the dialog with title', () => {
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      expect(screen.getByText('Add Assignment')).toBeInTheDocument()
    })

    it('renders assignment type selector with default value', () => {
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      const assignmentTypeSelect = screen.getByLabelText('Assignment type')
      expect(assignmentTypeSelect).toBeInTheDocument()
    })

    it('renders Add and Cancel buttons', () => {
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('renders User field for user-project type (default)', () => {
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      expect(screen.getByPlaceholderText('Select a user...')).toBeInTheDocument()
    })

    it('renders Project field for project-scoped type', () => {
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      // Project field is rendered for user-project (default)
      expect(screen.getByText('Project')).toBeInTheDocument()
    })

    it('renders Role field', () => {
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      expect(screen.getByText('Role')).toBeInTheDocument()
    })
  })

  describe('Assignment Type Switching', () => {
    it('shows Group ID field when group-project is selected', async () => {
      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      const typeSelect = screen.getByLabelText('Assignment type')
      await user.selectOptions(typeSelect, 'group-project')

      expect(screen.getByRole('textbox', { name: 'Group ID' })).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Select a user...')).not.toBeInTheDocument()
    })

    it('shows User field for user-system type', async () => {
      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      const typeSelect = screen.getByLabelText('Assignment type')
      await user.selectOptions(typeSelect, 'user-system')

      expect(screen.getByPlaceholderText('Select a user...')).toBeInTheDocument()
      // No project field for system-scoped
      expect(screen.queryByText('Project')).not.toBeInTheDocument()
    })

    it('shows Group ID field for group-system type', async () => {
      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      const typeSelect = screen.getByLabelText('Assignment type')
      await user.selectOptions(typeSelect, 'group-system')

      expect(screen.getByRole('textbox', { name: 'Group ID' })).toBeInTheDocument()
      expect(screen.queryByText('Project')).not.toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    async function fillAndSubmitUserProjectForm(user: ReturnType<typeof userEvent.setup>) {
      // Select a project from the typeahead FIRST (role dropdown is disabled until project is selected)
      const projectInput = screen.getByPlaceholderText('Select a project...')
      await user.click(projectInput)
      const projectOption = await screen.findByRole('option', { name: 'Project Alpha' })
      await user.click(projectOption)

      // Select a user from the typeahead
      const userInput = screen.getByPlaceholderText('Select a user...')
      await user.click(userInput)
      const userOption = await screen.findByRole('option', { name: 'alice' })
      await user.click(userOption)

      // Select a role from the typeahead (options include scope tags, e.g. "Project ProjectAdmin")
      const roleInput = screen.getByPlaceholderText('Select a role...')
      await user.click(roleInput)
      const roleOption = await screen.findByRole('option', { name: /ProjectAdmin/ })
      await user.click(roleOption)

      // Submit
      await user.click(screen.getByRole('button', { name: 'Add' }))
    }

    it('calls assignProjectRole mutation for user-project type', async () => {
      const mockMutate = vi.fn()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockMutate,
      } as never)

      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      await fillAndSubmitUserProjectForm(user)

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })

    it('calls assignProjectGroupRole mutation for group-project type', async () => {
      const mockMutate = vi.fn()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockMutate,
      } as never)

      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      // Switch to group-project
      const typeSelect = screen.getByLabelText('Assignment type')
      await user.selectOptions(typeSelect, 'group-project')

      // Select a project FIRST (role dropdown is disabled until project is selected)
      const projectInput = screen.getByPlaceholderText('Select a project...')
      await user.click(projectInput)
      const projectOption = await screen.findByRole('option', { name: 'Project Alpha' })
      await user.click(projectOption)

      // Fill Group ID
      const groupIdInput = screen.getByRole('textbox', { name: 'Group ID' })
      await user.type(groupIdInput, 'test-group')

      // Select a role (options include scope tags)
      const roleInput = screen.getByPlaceholderText('Select a role...')
      await user.click(roleInput)
      const roleOption = await screen.findByRole('option', { name: /ProjectAdmin/ })
      await user.click(roleOption)

      await user.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })

    it('calls onSuccess and onClose on successful mutation', async () => {
      const mockMutate = vi.fn()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockMutate,
      } as never)

      const onSuccess = vi.fn()
      const onClose = vi.fn()
      const user = userEvent.setup()
      render(<AssignRoleDialog onClose={onClose} onSuccess={onSuccess} />, { wrapper })

      await fillAndSubmitUserProjectForm(user)

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })

      // Simulate successful mutation callback
      const callbacks = mockMutate.mock.calls[0]?.[1] as { onSuccess?: () => void } | undefined
      if (callbacks?.onSuccess) {
        act(() => {
          callbacks.onSuccess!()
        })
        expect(onSuccess).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
      }
    })

    it('handles error mutation callback', async () => {
      const mockMutate = vi.fn()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockMutate,
      } as never)

      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      await fillAndSubmitUserProjectForm(user)

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })

      // Simulate error mutation callback
      const callbacks = mockMutate.mock.calls[0]?.[1] as { onError?: (err: Error) => void } | undefined
      if (callbacks?.onError) {
        act(() => {
          callbacks.onError!(new Error('Permission denied'))
        })
      }
    })

    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<AssignRoleDialog {...defaultProps} onClose={onClose} />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('System-Scoped Submission', () => {
    it('calls assignSystemUserRole mutation for user-system type', async () => {
      const mockMutate = vi.fn()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockMutate,
      } as never)

      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      // Switch to user-system
      const typeSelect = screen.getByLabelText('Assignment type')
      await user.selectOptions(typeSelect, 'user-system')

      // Select a user from the typeahead
      const userInput = screen.getByPlaceholderText('Select a user...')
      await user.click(userInput)
      const userOption = await screen.findByRole('option', { name: 'alice' })
      await user.click(userOption)

      // Select a role (system-scoped uses role ID as value, options include scope tags)
      const roleInput = screen.getByPlaceholderText('Select a role...')
      await user.click(roleInput)
      // Use exact name to avoid matching "Project ProjectAdmin"
      const roleOption = await screen.findByRole('option', { name: /^System Admin$/ })
      await user.click(roleOption)

      await user.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })

      const callArgs = mockMutate.mock.calls[0] as [{ body: { user_id: string; role_id: string } }]
      expect(callArgs[0]).toEqual({ body: { user_id: 'u1', role_id: 'r1' } })
    })

    it('calls assignSystemGroupRole mutation for group-system type', async () => {
      const mockMutate = vi.fn()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockMutate,
      } as never)

      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      // Switch to group-system
      const typeSelect = screen.getByLabelText('Assignment type')
      await user.selectOptions(typeSelect, 'group-system')

      // Fill Group ID
      const groupIdInput = screen.getByRole('textbox', { name: 'Group ID' })
      await user.type(groupIdInput, 'test-group-id')

      // Select a role
      const roleInput = screen.getByPlaceholderText('Select a role...')
      await user.click(roleInput)
      const roleOption = await screen.findByRole('option', { name: /Viewer/ })
      await user.click(roleOption)

      await user.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })

      const callArgs = mockMutate.mock.calls[0] as [{ body: { group_id: string; role_id: string } }]
      expect(callArgs[0]).toEqual({ body: { group_id: 'test-group-id', role_id: 'r2' } })
    })
  })

  describe('Role Reset on Assignment Type Switch', () => {
    it('clears role selection when switching from project to system scope', async () => {
      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      // Select a project first so the role dropdown becomes enabled
      const projectInput = screen.getByPlaceholderText('Select a project...')
      await user.click(projectInput)
      await user.click(await screen.findByRole('option', { name: 'Project Alpha' }))

      // Select a role in project scope (default: user-project)
      const roleInput = screen.getByPlaceholderText('Select a role...')
      await user.click(roleInput)
      const roleOption = await screen.findByRole('option', { name: /ProjectAdmin/ })
      await user.click(roleOption)

      // Verify role is selected (clear buttons visible for both project and role)
      const clearButtons = screen.getAllByRole('button', { name: 'Clear selection' })
      expect(clearButtons.length).toBeGreaterThanOrEqual(1)

      // Switch to user-system (project field disappears, role resets)
      const typeSelect = screen.getByLabelText('Assignment type')
      await user.selectOptions(typeSelect, 'user-system')

      // Role field should be cleared — no clear button for role
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
      })
    })

    it('clears role selection when switching from system to project scope', async () => {
      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      // Switch to user-system first
      const typeSelect = screen.getByLabelText('Assignment type')
      await user.selectOptions(typeSelect, 'user-system')

      // Select a role in system scope (use exact name to avoid multiple matches)
      const roleInput = screen.getByPlaceholderText('Select a role...')
      await user.click(roleInput)
      const roleOption = await screen.findByRole('option', { name: /^System Admin$/ })
      await user.click(roleOption)

      // Verify role is selected
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument()

      // Switch back to user-project
      await user.selectOptions(typeSelect, 'user-project')

      // Role field should be cleared
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()
      })
    })

    it('submits correct role value after switching to system scope and re-selecting', async () => {
      const mockMutate = vi.fn()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        ...mockMutationReturn,
        mutate: mockMutate,
      } as never)

      const user = userEvent.setup()
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      // Select a project first so the role dropdown becomes enabled
      const projectInput = screen.getByPlaceholderText('Select a project...')
      await user.click(projectInput)
      await user.click(await screen.findByRole('option', { name: 'Project Alpha' }))

      // Select a role in project scope
      let roleInput = screen.getByPlaceholderText('Select a role...')
      await user.click(roleInput)
      let roleOption = await screen.findByRole('option', { name: /ProjectAdmin/ })
      await user.click(roleOption)

      // Switch to user-system
      const typeSelect = screen.getByLabelText('Assignment type')
      await user.selectOptions(typeSelect, 'user-system')

      // Select a user from the typeahead
      const userInput = screen.getByPlaceholderText('Select a user...')
      await user.click(userInput)
      const userOption = await screen.findByRole('option', { name: 'bob' })
      await user.click(userOption)

      // Re-select a role (now uses roleId, options include scope tags)
      roleInput = screen.getByPlaceholderText('Select a role...')
      await user.click(roleInput)
      roleOption = await screen.findByRole('option', { name: /Viewer/ })
      await user.click(roleOption)

      await user.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })

      const callArgs = mockMutate.mock.calls[0] as [{ body: { user_id: string; role_id: string } }]
      expect(callArgs[0]).toEqual({ body: { user_id: 'u2', role_id: 'r2' } })
    })
  })

  describe('Project ID Default', () => {
    it('renders without error', () => {
      render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      expect(screen.getByText('Add Assignment')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(<AssignRoleDialog {...defaultProps} />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
