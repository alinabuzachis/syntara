import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../providers/alerts'
import { accessClient } from '../access/accessClient'
import type { ProjectRead } from '../access/types'
import { useAllProjects } from '../access/useAllProjects'

import { ProjectsTab } from './ProjectsTab'

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../access/accessClient', () => ({
  accessClient: {
    useMutation: vi.fn(),
  },
}))

vi.mock('../access/useAllProjects', () => ({
  useAllProjects: vi.fn(),
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

vi.mock('wouter', async () => {
  const React = await import('react')
  return {
    useLocation: () => ['/access-management/projects', vi.fn()],
    useSearch: () => '',
    useSearchParams: () => React.useState(new URLSearchParams()),
  }
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

describe('ProjectsTab', () => {
  const mockProjects: ProjectRead[] = [
    {
      id: 'p1',
      name: 'Alpha',
      description: 'Alpha project',
      labels: {},
      is_default: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    },
    {
      id: 'p2',
      name: 'Beta',
      description: 'Beta project',
      labels: {},
      is_default: false,
      created_at: '2024-02-01T00:00:00Z',
      updated_at: '2024-02-02T00:00:00Z',
    },
    {
      id: 'p3',
      name: 'Gamma',
      description: null,
      labels: {},
      is_default: false,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-02T00:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAllProjects).mockReturnValue({
      projects: mockProjects,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    vi.mocked(accessClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      data: null,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      isIdle: true,
      isSuccess: false,
      failureCount: 0,
      failureReason: null,
      context: undefined,
      submittedAt: 0,
      variables: undefined,
      status: 'idle',
      isPaused: false,
    } as never)
  })

  describe('Rendering', () => {
    it('renders the table with projects', () => {
      render(<ProjectsTab />, { wrapper })

      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.getByText('Beta')).toBeInTheDocument()
      expect(screen.getByText('Gamma')).toBeInTheDocument()
    })

    it('renders Create project button', () => {
      render(<ProjectsTab />, { wrapper })

      expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument()
    })

    it('renders table column headers', () => {
      render(<ProjectsTab />, { wrapper })

      expect(screen.getByRole('columnheader', { name: /^Name$/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Description/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Created/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Updated/i })).toBeInTheDocument()
    })

    it('renders description as empty string for null', () => {
      render(<ProjectsTab />, { wrapper })

      // Gamma has null description — verify it renders without error
      expect(screen.getByText('Gamma')).toBeInTheDocument()
      expect(screen.getByText('Alpha project')).toBeInTheDocument()
    })

    it('renders project names as links', () => {
      render(<ProjectsTab />, { wrapper })

      expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('displays empty state when no projects exist', () => {
      vi.mocked(useAllProjects).mockReturnValue({
        projects: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<ProjectsTab />, { wrapper })

      expect(screen.getByText('No projects yet')).toBeInTheDocument()
      expect(screen.getByText('Create a project to organize workflows and manage access.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument()
    })

    it('opens create modal from empty state button', async () => {
      const user = userEvent.setup()

      vi.mocked(useAllProjects).mockReturnValue({
        projects: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<ProjectsTab />, { wrapper })

      await user.click(screen.getByRole('button', { name: /create project/i }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter project name')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('displays loading state', () => {
      vi.mocked(useAllProjects).mockReturnValue({
        projects: [],
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })

      render(<ProjectsTab />, { wrapper })

      expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    })

    it('displays error state', () => {
      vi.mocked(useAllProjects).mockReturnValue({
        projects: [],
        isLoading: false,
        error: new Error('Failed to load'),
        refetch: vi.fn(),
      })

      render(<ProjectsTab />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Error loading projects' })).toBeInTheDocument()
    })
  })

  describe('Sorting', () => {
    it('renders sortable column headers', () => {
      render(<ProjectsTab />, { wrapper })

      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      expect(within(nameHeader).getByRole('button')).toBeInTheDocument()

      const createdHeader = screen.getByRole('columnheader', { name: /Created/i })
      expect(within(createdHeader).getByRole('button')).toBeInTheDocument()

      const updatedHeader = screen.getByRole('columnheader', { name: /Updated/i })
      expect(within(updatedHeader).getByRole('button')).toBeInTheDocument()
    })

    it('sorts by Name ascending when header is clicked', async () => {
      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      await user.click(within(nameHeader).getByRole('button'))

      // Verify sort applied — Alpha should be first in ascending
      const table = screen.getByRole('grid', { name: 'Projects' })
      const rows = within(table).getAllByRole('row')
      // rows[0] is header
      expect(within(rows[1]).getByText('Alpha')).toBeInTheDocument()
      expect(within(rows[2]).getByText('Beta')).toBeInTheDocument()
      expect(within(rows[3]).getByText('Gamma')).toBeInTheDocument()
    })
  })

  describe('Filtering', () => {
    it('renders filter bar with name filter input', () => {
      render(<ProjectsTab />, { wrapper })

      expect(screen.getByPlaceholderText('Filter by name')).toBeInTheDocument()
    })

    it('accepts text input in the name filter', async () => {
      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      const textInput = screen.getByPlaceholderText('Filter by name')
      await user.type(textInput, 'Alpha')
      expect(textInput).toHaveValue('Alpha')
    })

    it('shows filter empty state when no results match', async () => {
      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      const textInput = screen.getByPlaceholderText('Filter by name')
      await user.type(textInput, 'nonexistent')
      await user.click(screen.getByRole('button', { name: 'Apply filter' }))

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument()
      })
    })
  })

  describe('Row Actions', () => {
    it('provides row action menus', () => {
      render(<ProjectsTab />, { wrapper })

      const table = screen.getByRole('grid', { name: 'Projects' })
      const rows = within(table).getAllByRole('row')
      // Header + 3 data rows
      expect(rows.length).toBeGreaterThanOrEqual(4)
    })

    it('opens edit modal when edit action is clicked', async () => {
      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const editOption = await screen.findByRole('menuitem', { name: /edit/i })
      await user.click(editOption)

      await waitFor(() => {
        expect(screen.getByText('Edit project')).toBeInTheDocument()
      })
    })

    it('opens delete dialog when delete action is clicked', async () => {
      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      await waitFor(() => {
        expect(screen.getByText('Delete project?')).toBeInTheDocument()
      })

      // Verify the project name renders in the dialog body (covers project?.name branch)
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('Alpha')).toBeInTheDocument()
      expect(within(dialog).getByText(/will be deleted/)).toBeInTheDocument()
      expect(
        within(dialog).getByRole('checkbox', { name: 'I understand this project will be permanently deleted.' })
      ).toBeInTheDocument()
    })
  })

  describe('Delete Dialog Content', () => {
    it('renders project name in dialog body when project is selected for deletion', async () => {
      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      // Open delete dialog for the second project (Beta)
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[1])
      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Beta')).toBeInTheDocument()
      expect(within(dialog).getByText(/will be deleted/)).toBeInTheDocument()
    })
  })

  describe('Delete Dialog Flow', () => {
    it('calls delete mutation when Delete button is clicked', async () => {
      const user = userEvent.setup()
      const mockDeleteMutate = vi.fn()
      const mockRefetch = vi.fn()

      vi.mocked(useAllProjects).mockReturnValue({
        projects: mockProjects,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      })

      vi.mocked(accessClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        isPending: false,
      } as never)

      render(<ProjectsTab />, { wrapper })

      // Open actions and click delete
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      // Delete button should be disabled until acknowledgement checkbox is checked
      const deleteButton = await screen.findByRole('button', { name: 'Delete' })
      expect(deleteButton).toBeDisabled()

      // Check acknowledgement checkbox
      const ackCheckbox = screen.getByRole('checkbox')
      await user.click(ackCheckbox)
      expect(deleteButton).toBeEnabled()

      await user.click(deleteButton)
      expect(mockDeleteMutate).toHaveBeenCalled()
    })

    it('shows success alert and closes dialog on successful delete', async () => {
      const user = userEvent.setup()
      const mockDeleteMutate = vi.fn()
      const mockRefetch = vi.fn().mockResolvedValue({})

      vi.mocked(useAllProjects).mockReturnValue({
        projects: mockProjects,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      })

      vi.mocked(accessClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        isPending: false,
      } as never)

      render(<ProjectsTab />, { wrapper })

      // Open delete dialog
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      // Check acknowledgement and click Delete
      await user.click(screen.getByRole('checkbox'))
      const deleteButton = await screen.findByRole('button', { name: 'Delete' })
      await user.click(deleteButton)

      // Simulate successful mutation
      const callbacks = mockDeleteMutate.mock.calls[0][1] as { onSuccess: () => void; onSettled: () => void }
      act(() => {
        callbacks.onSuccess()
        callbacks.onSettled()
      })

      await waitFor(() => {
        expect(screen.queryByText('Delete project?')).not.toBeInTheDocument()
      })
      expect(mockRefetch).toHaveBeenCalled()
    })

    it('shows error alert on delete failure', async () => {
      const user = userEvent.setup()
      const mockDeleteMutate = vi.fn()

      vi.mocked(accessClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        isPending: false,
      } as never)

      render(<ProjectsTab />, { wrapper })

      // Open delete dialog
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      // Check acknowledgement and click Delete
      await user.click(screen.getByRole('checkbox'))
      const deleteButton = await screen.findByRole('button', { name: 'Delete' })
      await user.click(deleteButton)

      // Simulate failed mutation
      const callbacks = mockDeleteMutate.mock.calls[0][1] as {
        onError: (err: Error) => void
        onSettled: () => void
      }
      act(() => {
        callbacks.onError(new Error('Permission denied'))
        callbacks.onSettled()
      })

      await waitFor(() => {
        expect(screen.queryByText('Delete project?')).not.toBeInTheDocument()
      })
    })

    it('closes delete dialog when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      // Open delete dialog
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const deleteOption = await screen.findByRole('menuitem', { name: /delete/i })
      await user.click(deleteOption)

      await waitFor(() => {
        expect(screen.getByText('Delete project?')).toBeInTheDocument()
      })

      // Click Cancel
      const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
      await user.click(cancelButtons[cancelButtons.length - 1])

      await waitFor(() => {
        expect(screen.queryByText(/will be deleted/)).not.toBeInTheDocument()
      })
    })
  })

  describe('Create Project', () => {
    it('opens create modal when Create project button is clicked', async () => {
      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      await user.click(screen.getByRole('button', { name: /create project/i }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter project name')).toBeInTheDocument()
      })
    })

    it('closes create modal when cancel is clicked and clears edit state', async () => {
      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      // Open the edit modal via row action
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const editOption = await screen.findByRole('menuitem', { name: /edit/i })
      await user.click(editOption)

      await waitFor(() => {
        expect(screen.getByText('Edit project')).toBeInTheDocument()
      })

      // Close it
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByText('Edit project')).not.toBeInTheDocument()
      })
    })

    it('refetches after successful create from empty state', async () => {
      const mockRefetch = vi.fn().mockResolvedValue({})
      vi.mocked(useAllProjects).mockReturnValue({
        projects: [],
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      })

      const mockCreateMutate = vi.fn()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        mutate: mockCreateMutate,
        isPending: false,
      } as never)

      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      // Open modal from empty state
      await user.click(screen.getByRole('button', { name: /create project/i }))

      // Fill in name and submit
      await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'New')
      await user.click(screen.getByRole('button', { name: 'Create project' }))

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })

      // Simulate successful mutation — triggers onSuccess which calls refetch
      const callbacks = mockCreateMutate.mock.calls[0][1] as { onSuccess: () => void }
      act(() => {
        callbacks.onSuccess()
      })

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled()
      })
    })

    it('refetches after successful create from table view', async () => {
      const mockRefetch = vi.fn().mockResolvedValue({})
      vi.mocked(useAllProjects).mockReturnValue({
        projects: mockProjects,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      })

      const mockCreateMutate = vi.fn()
      vi.mocked(accessClient.useMutation).mockReturnValue({
        mutate: mockCreateMutate,
        isPending: false,
      } as never)

      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      // Open modal
      await user.click(screen.getByRole('button', { name: /create project/i }))

      // Fill in name and submit
      await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'New')
      await user.click(screen.getByRole('button', { name: 'Create project' }))

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })

      // Simulate success
      const callbacks = mockCreateMutate.mock.calls[0][1] as { onSuccess: () => void }
      act(() => {
        callbacks.onSuccess()
      })

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled()
      })
    })
  })

  describe('Pagination', () => {
    it('renders pagination footer', () => {
      render(<ProjectsTab />, { wrapper })

      expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    })

    it('navigates to next page when next is clicked', async () => {
      // Create enough projects to require pagination (> 20 = default perPage)
      const manyProjects: ProjectRead[] = Array.from({ length: 25 }, (_, i) => ({
        id: `p${i}`,
        name: `Project ${i}`,
        description: null,
        labels: {},
        is_default: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }))

      vi.mocked(useAllProjects).mockReturnValue({
        projects: manyProjects,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      // After navigating, we should see the remaining projects
      await waitFor(() => {
        expect(screen.getByText('Project 20')).toBeInTheDocument()
      })
    })

    it('navigates to previous page', async () => {
      const manyProjects: ProjectRead[] = Array.from({ length: 25 }, (_, i) => ({
        id: `p${i}`,
        name: `Project ${String(i).padStart(2, '0')}`,
        description: null,
        labels: {},
        is_default: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }))

      vi.mocked(useAllProjects).mockReturnValue({
        projects: manyProjects,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const user = userEvent.setup()
      render(<ProjectsTab />, { wrapper })

      // Go to page 2
      await user.click(screen.getByRole('button', { name: /next/i }))
      await waitFor(() => {
        expect(screen.getByText('Project 20')).toBeInTheDocument()
      })

      // Go back to page 1
      await user.click(screen.getByRole('button', { name: /previous/i }))
      await waitFor(() => {
        expect(screen.getByText('Project 00')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(<ProjectsTab />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in empty state', async () => {
      vi.mocked(useAllProjects).mockReturnValue({
        projects: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { container } = render(<ProjectsTab />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
