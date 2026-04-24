import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ProjectRead } from '../routes/access/types'

import { useProjectSelector } from './useProjectSelector'

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()

vi.mock('../components/alerts', () => ({
  useAlerts: () => ({
    showAlert: vi.fn(),
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showWarning: vi.fn(),
    showInfo: vi.fn(),
    dismissAlert: vi.fn(),
    clearAllAlerts: vi.fn(),
  }),
}))

const mockSetSelectedProjectId = vi.fn()
let mockSelectedProjectId: string | null = null

vi.mock('../stores/useProjectStore', () => ({
  useProjectStore: () => ({
    selectedProjectId: mockSelectedProjectId,
    setSelectedProjectId: mockSetSelectedProjectId,
  }),
}))

const mockRefetch = vi.fn().mockResolvedValue({ data: [] })
let mockProjectsData: ProjectRead[] | undefined = []

vi.mock('../routes/access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn().mockImplementation(() => ({
      data: mockProjectsData,
      isPending: false,
      error: null,
      refetch: mockRefetch,
    })),
    useMutation: vi.fn().mockImplementation(() => ({
      mutate: mockMutate,
      isPending: false,
    })),
  },
}))

const mockMutate = vi.fn()

// ── Helpers ───────────────────────────────────────────────────────────────

const sampleProjects: ProjectRead[] = [
  {
    id: 'proj-1',
    name: 'Alpha',
    description: 'First project',
    labels: {},
    is_default: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'proj-2',
    name: 'Beta',
    description: 'Second project',
    labels: {},
    is_default: false,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
]

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

/**
 * Renders the ProjectSelector JSX into the DOM so we can test the dropdown UI.
 */
function renderSelector(options?: Parameters<typeof useProjectSelector>[0]) {
  function SelectorHost() {
    const { ProjectSelector } = useProjectSelector(options)
    return <>{ProjectSelector}</>
  }

  return render(<SelectorHost />, { wrapper })
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('useProjectSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    mockSelectedProjectId = null
    mockProjectsData = sampleProjects
  })

  // ── Return value tests ──────────────────────────────────────────────────

  describe('return values', () => {
    it('returns projects from query', () => {
      const { result } = renderHook(() => useProjectSelector(), { wrapper })

      expect(result.current.projects).toEqual(sampleProjects)
    })

    it('returns empty projects when query data is undefined', () => {
      mockProjectsData = undefined
      const { result } = renderHook(() => useProjectSelector(), { wrapper })

      expect(result.current.projects).toEqual([])
    })

    it('returns isAllProjects true when no project selected', () => {
      mockSelectedProjectId = null
      const { result } = renderHook(() => useProjectSelector(), { wrapper })

      expect(result.current.isAllProjects).toBe(true)
      expect(result.current.selectedProject).toBeNull()
    })

    it('returns isAllProjects false when a project is selected', () => {
      mockSelectedProjectId = 'proj-1'
      const { result } = renderHook(() => useProjectSelector(), { wrapper })

      expect(result.current.isAllProjects).toBe(false)
    })

    it('returns selectedProject matching store ID', () => {
      mockSelectedProjectId = 'proj-2'
      const { result } = renderHook(() => useProjectSelector(), { wrapper })

      expect(result.current.selectedProject).toEqual(sampleProjects[1])
    })

    it('returns null selectedProject when ID does not match any project', () => {
      mockSelectedProjectId = 'nonexistent-id'
      const { result } = renderHook(() => useProjectSelector(), { wrapper })

      expect(result.current.selectedProject).toBeNull()
    })
  })

  // ── Stale project cleanup ───────────────────────────────────────────────

  describe('stale project cleanup', () => {
    it('clears stale project ID that does not match any known project', async () => {
      mockSelectedProjectId = 'stale-project-id'
      mockProjectsData = sampleProjects

      renderHook(() => useProjectSelector(), { wrapper })

      await waitFor(() => {
        expect(mockSetSelectedProjectId).toHaveBeenCalledWith(null)
      })
    })

    it('does not clear project ID when it matches a known project', () => {
      mockSelectedProjectId = 'proj-1'
      mockProjectsData = sampleProjects

      renderHook(() => useProjectSelector(), { wrapper })

      expect(mockSetSelectedProjectId).not.toHaveBeenCalled()
    })

    it('does not clear when projects data is empty', () => {
      mockSelectedProjectId = 'some-id'
      mockProjectsData = []

      renderHook(() => useProjectSelector(), { wrapper })

      expect(mockSetSelectedProjectId).not.toHaveBeenCalled()
    })

    it('does not clear when projects data is undefined', () => {
      mockSelectedProjectId = 'some-id'
      mockProjectsData = undefined

      renderHook(() => useProjectSelector(), { wrapper })

      expect(mockSetSelectedProjectId).not.toHaveBeenCalled()
    })
  })

  // ── ProjectSelector UI ─────────────────────────────────────────────────

  describe('ProjectSelector UI', () => {
    it('shows "All projects" in toggle when no project selected', () => {
      renderSelector()

      expect(screen.getByDisplayValue('All projects')).toBeInTheDocument()
    })

    it('shows selected project name in toggle', () => {
      mockSelectedProjectId = 'proj-1'
      renderSelector()

      expect(screen.getByDisplayValue('Alpha')).toBeInTheDocument()
    })

    it('shows "Select a project" in requireProject mode', () => {
      renderSelector({ requireProject: true })

      expect(screen.getByPlaceholderText('Select a project')).toBeInTheDocument()
    })

    it('shows All projects option and project list in dropdown', async () => {
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))

      expect(screen.getByRole('option', { name: /All projects/i })).toBeInTheDocument()
      expect(screen.getByText('View all items you have access to.')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Alpha/i })).toBeInTheDocument()
      expect(screen.getByText('First project')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Beta/i })).toBeInTheDocument()
      expect(screen.getByText('Second project')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Create project' })).toBeInTheDocument()
    })

    it('hides "All projects" option when requireProject is true', async () => {
      const user = userEvent.setup()
      renderSelector({ requireProject: true })

      await user.click(screen.getByPlaceholderText('Select a project'))

      expect(screen.queryByRole('option', { name: 'All projects' })).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Alpha/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Beta/i })).toBeInTheDocument()
    })

    it('selects a project when option is clicked', async () => {
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))
      await user.click(screen.getByRole('option', { name: /Beta/i }))

      expect(mockSetSelectedProjectId).toHaveBeenCalledWith('proj-2')
    })

    it('selects "All projects" to clear selection', async () => {
      mockSelectedProjectId = 'proj-1'
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('Alpha'))
      await user.click(screen.getByRole('option', { name: /All projects/i }))

      expect(mockSetSelectedProjectId).toHaveBeenCalledWith(null)
    })

    it('omits description line when project description is empty', async () => {
      mockProjectsData = [
        {
          id: 'proj-empty',
          name: 'NoDesc',
          description: '',
          labels: {},
          is_default: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))
      expect(screen.getByRole('option', { name: /^NoDesc$/i })).toBeInTheDocument()
    })
  })

  // ── Create project modal ───────────────────────────────────────────────

  describe('create project modal', () => {
    it('opens modal when "Create project" is clicked', async () => {
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))
      await user.click(screen.getByRole('option', { name: 'Create project' }))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText('Project name')).toBeInTheDocument()
      expect(screen.getByLabelText('Project description')).toBeInTheDocument()
    })

    it('closes modal when Cancel is clicked', async () => {
      const user = userEvent.setup()
      renderSelector()

      // Open dropdown then create dialog
      await user.click(screen.getByDisplayValue('All projects'))
      await user.click(screen.getByRole('option', { name: 'Create project' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Click Cancel
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('closes modal when the X (close) button is clicked', async () => {
      const user = userEvent.setup()
      renderSelector()

      // Open create dialog
      await user.click(screen.getByDisplayValue('All projects'))
      await user.click(screen.getByRole('option', { name: 'Create project' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Click the modal close button (X)
      await user.click(screen.getByRole('button', { name: 'Close' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('submits create project form with name and description', async () => {
      const user = userEvent.setup()
      renderSelector()

      // Open create dialog
      await user.click(screen.getByDisplayValue('All projects'))
      await user.click(screen.getByRole('option', { name: 'Create project' }))

      // Fill form
      await user.type(screen.getByLabelText('Project name'), 'New Project')
      await user.type(screen.getByLabelText('Project description'), 'A new test project')

      // Submit
      await user.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          { body: { name: 'New Project', description: 'A new test project' } },
          expect.objectContaining({
            onSuccess: expect.any(Function) as unknown,
            onError: expect.any(Function) as unknown,
          })
        )
      })
    })

    it('calls showSuccess and selects new project on create success', async () => {
      const createdProject: ProjectRead = {
        id: 'proj-new',
        name: 'New Project',
        description: 'Created',
        labels: {},
        is_default: false,
        created_at: '2024-03-01T00:00:00Z',
        updated_at: '2024-03-01T00:00:00Z',
      }

      // Make mutate call onSuccess synchronously
      mockMutate.mockImplementation((_body: unknown, opts: { onSuccess: (data: ProjectRead) => void }) => {
        opts.onSuccess(createdProject)
      })

      const user = userEvent.setup()
      renderSelector()

      // Open create dialog
      await user.click(screen.getByDisplayValue('All projects'))
      await user.click(screen.getByRole('option', { name: 'Create project' }))

      // Fill and submit
      await user.type(screen.getByLabelText('Project name'), 'New Project')
      await user.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(mockShowSuccess).toHaveBeenCalledWith('Project created', 'Project "New Project" created')
        expect(mockSetSelectedProjectId).toHaveBeenCalledWith('proj-new')
        expect(mockRefetch).toHaveBeenCalled()
      })
    })

    it('calls showError on create failure', async () => {
      mockMutate.mockImplementation((_body: unknown, opts: { onError: (err: unknown) => void }) => {
        opts.onError({ detail: 'Name already exists' })
      })

      const user = userEvent.setup()
      renderSelector()

      // Open create dialog
      await user.click(screen.getByDisplayValue('All projects'))
      await user.click(screen.getByRole('option', { name: 'Create project' }))

      // Fill and submit
      await user.type(screen.getByLabelText('Project name'), 'Duplicate')
      await user.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith('Failed to create project', 'Name already exists')
      })
    })
  })

  // ── Accessibility ──────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('has no accessibility violations in default state', async () => {
      const { container } = renderSelector()
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in requireProject mode', async () => {
      const { container } = renderSelector({ requireProject: true })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations when dropdown is open', async () => {
      const user = userEvent.setup()
      const { container } = renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations when create modal is open', async () => {
      const user = userEvent.setup()
      const { container } = renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))
      await user.click(screen.getByRole('option', { name: 'Create project' }))

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
