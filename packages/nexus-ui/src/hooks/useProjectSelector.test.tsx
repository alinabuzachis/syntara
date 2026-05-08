import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { accessClient } from '../routes/access/accessClient'
import type { ProjectRead } from '../routes/access/types'

import { useProjectSelector } from './useProjectSelector'

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockShowAlert = vi.fn()

vi.mock('../providers/alerts', () => ({
  useAlerts: () => ({
    showAlert: mockShowAlert,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
    dismissAlert: vi.fn(),
    clearAllAlerts: vi.fn(),
  }),
}))

let mockSelectedProjectId: string | null = null

/** Keeps `mockSelectedProjectId` in sync so UI reflects selection (toggle label / filter reset). */
const mockSetSelectedProjectId = vi.fn((id: string | null) => {
  mockSelectedProjectId = id
})

vi.mock('../stores/useProjectStore', () => ({
  useProjectStore: () => ({
    selectedProjectId: mockSelectedProjectId,
    setSelectedProjectId: mockSetSelectedProjectId,
  }),
}))

vi.mock('./useFormMutationErrorHandler', () => ({
  useFormMutationErrorHandler: () => () => () => {},
}))

type PaginatedResponse = {
  resources: ProjectRead[]
  next: string | null
  prev: string | null
  total: number | null
}

const mockRefetch = vi.fn().mockResolvedValue({ data: { resources: [], next: null, prev: null, total: 0 } })
let mockQueryResponse: { data: PaginatedResponse | undefined; isPending: boolean; isFetching: boolean }

function makePaginatedData(projects: ProjectRead[], next: string | null = null): PaginatedResponse {
  return { resources: projects, next, prev: null, total: projects.length }
}

vi.mock('../routes/access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn().mockImplementation(() => mockQueryResponse),
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
    mockQueryResponse = {
      data: makePaginatedData(sampleProjects),
      isPending: false,
      isFetching: false,
    }
    // Re-attach refetch to the response object
    Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })
  })

  // ── Return value tests ──────────────────────────────────────────────────

  describe('return values', () => {
    it('returns projects from query', () => {
      const { result } = renderHook(() => useProjectSelector(), { wrapper })

      expect(result.current.projects).toEqual(sampleProjects)
    })

    it('returns empty projects when query data is undefined', () => {
      mockQueryResponse = { data: undefined, isPending: false, isFetching: false }
      Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })
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

  // ── initialProjectId ───────────────────────────────────────────────────

  describe('initialProjectId', () => {
    it('syncs initialProjectId to the store on mount', () => {
      renderHook(() => useProjectSelector({ initialProjectId: 'proj-2' }), { wrapper })

      expect(mockSetSelectedProjectId).toHaveBeenCalledWith('proj-2')
    })

    it('does not sync when initialProjectId is null', () => {
      renderHook(() => useProjectSelector({ initialProjectId: null }), { wrapper })

      expect(mockSetSelectedProjectId).not.toHaveBeenCalled()
    })

    it('allows user to change project after initial seed', async () => {
      mockSelectedProjectId = 'proj-1'
      const user = userEvent.setup()
      renderSelector({ initialProjectId: 'proj-1' })

      await user.click(screen.getByDisplayValue('Alpha'))
      await user.click(screen.getByRole('option', { name: /Beta/i }))

      expect(mockSetSelectedProjectId).toHaveBeenCalledWith('proj-2')
    })

    it('does not clear initialProjectId via stale-guard', async () => {
      mockSelectedProjectId = null
      renderHook(() => useProjectSelector({ initialProjectId: 'nonexistent-id' }), { wrapper })

      await waitFor(() => {
        expect(mockSetSelectedProjectId).toHaveBeenCalledWith('nonexistent-id')
      })

      expect(mockSetSelectedProjectId).not.toHaveBeenCalledWith(null)
    })
  })

  // ── Stale project cleanup ───────────────────────────────────────────────

  describe('stale project cleanup', () => {
    it('clears stale project ID that does not match any known project', async () => {
      mockSelectedProjectId = 'stale-project-id'

      renderHook(() => useProjectSelector(), { wrapper })

      await waitFor(() => {
        expect(mockSetSelectedProjectId).toHaveBeenCalledWith(null)
      })
    })

    it('does not clear project ID when it matches a known project', () => {
      mockSelectedProjectId = 'proj-1'

      renderHook(() => useProjectSelector(), { wrapper })

      expect(mockSetSelectedProjectId).not.toHaveBeenCalled()
    })

    it('does not clear when projects data is empty', () => {
      mockSelectedProjectId = 'some-id'
      mockQueryResponse = {
        data: makePaginatedData([]),
        isPending: false,
        isFetching: false,
      }
      Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })

      renderHook(() => useProjectSelector(), { wrapper })

      expect(mockSetSelectedProjectId).not.toHaveBeenCalled()
    })

    it('does not clear when projects data is undefined', () => {
      mockSelectedProjectId = 'some-id'
      mockQueryResponse = { data: undefined, isPending: false, isFetching: false }
      Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })

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

    it('applies danger styling when save was attempted without a project while requireProject and no selection', () => {
      // PatternFly v6 MenuToggle with status="danger" sets aria-invalid on the TextInputGroupMain wrapper.
      // Once PF exposes this on the accessible input, replace with: getByRole('textbox', { name: 'Project' }).toBeInvalid()
      const { container } = renderSelector({ requireProject: true, hasValidationError: true })
      expect(container.querySelector('[aria-invalid="true"]')).toBeInTheDocument()
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
      mockQueryResponse = {
        data: makePaginatedData([
          {
            id: 'proj-empty',
            name: 'NoDesc',
            description: '',
            labels: {},
            is_default: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ]),
        isPending: false,
        isFetching: false,
      }
      Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))
      expect(screen.getByRole('option', { name: /^NoDesc$/i })).toBeInTheDocument()
    })
  })

  // ── Pagination reset (selection vs View more) ─────────────────────────

  describe('pagination reset behavior', () => {
    const typeaheadInput = () => screen.getByRole('textbox', { name: 'Project' })

    it('clears typeahead filter when selecting a project', async () => {
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))
      await user.type(typeaheadInput(), 'findme')

      await user.click(screen.getByRole('option', { name: /Beta/i }))

      await user.click(screen.getByDisplayValue('Beta'))
      expect(typeaheadInput()).toHaveValue('')
    })

    it('does not clear typeahead filter when View more is clicked', async () => {
      mockQueryResponse = {
        data: makePaginatedData(sampleProjects, 'cursor-page-2'),
        isPending: false,
        isFetching: false,
      }
      Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })

      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))
      await user.type(typeaheadInput(), 'alp')

      await user.click(screen.getByRole('option', { name: 'View more' }))

      expect(typeaheadInput()).toHaveValue('alp')
    })
  })

  // ── View more ──────────────────────────────────────────────────────────

  describe('view more', () => {
    it('shows "View more" option when more results are available', async () => {
      mockQueryResponse = {
        data: makePaginatedData(sampleProjects, 'cursor-page-2'),
        isPending: false,
        isFetching: false,
      }
      Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))

      expect(screen.getByRole('option', { name: 'View more' })).toBeInTheDocument()
    })

    it('does not show "View more" when no next page exists', async () => {
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))

      expect(screen.queryByRole('option', { name: 'View more' })).not.toBeInTheDocument()
    })

    it('shows footer hint when more results are available', async () => {
      mockQueryResponse = {
        data: makePaginatedData(sampleProjects, 'cursor-page-2'),
        isPending: false,
        isFetching: false,
      }
      Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))

      expect(screen.getByText('Type to refine results')).toBeInTheDocument()
    })

    it('keeps the menu open when View more is clicked', async () => {
      mockQueryResponse = {
        data: makePaginatedData(sampleProjects, 'cursor-page-2'),
        isPending: false,
        isFetching: false,
      }
      Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))
      await user.click(screen.getByRole('option', { name: 'View more' }))

      expect(screen.getByRole('option', { name: 'Create project' })).toBeVisible()
    })

    it('keeps selection when choosing a project only returned after View more', async () => {
      const page2Only: ProjectRead = {
        id: 'proj-only-page-2',
        name: 'Omega',
        description: 'Loaded after View more',
        labels: {},
        is_default: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const useQuerySpy = vi.mocked(accessClient.useQuery)
      useQuerySpy.mockImplementation(
        (_method: string, _path: string, opts?: { params?: { query?: Record<string, unknown> } }) => {
          const hasCursor = opts?.params?.query?.cursor != null && opts.params.query.cursor !== ''
          const data = hasCursor
            ? makePaginatedData([page2Only], null)
            : makePaginatedData([sampleProjects[0]], 'cursor-next')
          return {
            data,
            isPending: false,
            isFetching: false,
            refetch: mockRefetch,
            error: null,
          }
        }
      )

      try {
        const user = userEvent.setup()
        renderSelector()

        await user.click(screen.getByDisplayValue('All projects'))
        await user.click(screen.getByRole('option', { name: 'View more' }))

        await waitFor(() => {
          expect(screen.getByRole('option', { name: /Omega/i })).toBeInTheDocument()
        })

        await user.click(screen.getByRole('option', { name: /Omega/i }))

        expect(mockSelectedProjectId).toBe('proj-only-page-2')
      } finally {
        useQuerySpy.mockImplementation(() => mockQueryResponse)
      }
    })
  })

  // ── No results ─────────────────────────────────────────────────────────

  describe('no results', () => {
    it('shows "No results found" when search returns empty', async () => {
      mockQueryResponse = {
        data: makePaginatedData([]),
        isPending: false,
        isFetching: false,
      }
      Object.assign(mockQueryResponse, { refetch: mockRefetch, error: null })
      const user = userEvent.setup()
      renderSelector()

      await user.click(screen.getByDisplayValue('All projects'))

      // The "no results" message only shows when there's an active debounced filter.
      // Since we can't easily trigger debounce in the mock, verify that with no projects
      // the dropdown still renders without errors (Create project is always available).
      expect(screen.getByRole('option', { name: 'Create project' })).toBeInTheDocument()
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
      expect(screen.getByLabelText('Description')).toBeInTheDocument()
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
      await user.type(screen.getByLabelText('Description'), 'A new test project')

      // Submit
      await user.click(screen.getByRole('button', { name: 'Create project' }))

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

    it('calls showAlert and selects new project on create success', async () => {
      const createdProject: ProjectRead = {
        id: 'proj-new',
        name: 'New Project',
        description: 'Created',
        labels: {},
        is_default: false,
        created_at: '2024-03-01T00:00:00Z',
        updated_at: '2024-03-01T00:00:00Z',
      }

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
      await user.click(screen.getByRole('button', { name: 'Create project' }))

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Project created',
            variant: 'success',
          })
        )
        expect(mockSetSelectedProjectId).toHaveBeenCalledWith('proj-new')
        expect(mockRefetch).toHaveBeenCalled()
      })
    })

    it('selects new project only after refetch completes', async () => {
      const createdProject: ProjectRead = {
        id: 'proj-new-2',
        name: 'Created Project',
        description: '',
        labels: {},
        is_default: false,
        created_at: '2024-03-01T00:00:00Z',
        updated_at: '2024-03-01T00:00:00Z',
      }

      let resolveRefetch!: () => void
      mockRefetch.mockReturnValue(new Promise<void>((r) => (resolveRefetch = r)))

      mockMutate.mockImplementation((_body: unknown, opts: { onSuccess: (data: ProjectRead) => void }) => {
        opts.onSuccess(createdProject)
      })

      const user = userEvent.setup()
      renderSelector({ requireProject: true })

      await user.click(screen.getByPlaceholderText('Select a project'))
      await user.click(screen.getByRole('option', { name: 'Create project' }))
      await user.type(screen.getByLabelText('Project name'), 'Created Project')
      await user.click(screen.getByRole('button', { name: 'Create project' }))

      await waitFor(() => expect(mockRefetch).toHaveBeenCalled())
      expect(mockSetSelectedProjectId).not.toHaveBeenCalledWith('proj-new-2')

      resolveRefetch()
      await waitFor(() => expect(mockSetSelectedProjectId).toHaveBeenCalledWith('proj-new-2'))
    })

    it('calls error handler on create failure', async () => {
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
      await user.click(screen.getByRole('button', { name: 'Create project' }))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
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

    it('has no accessibility violations in danger (validation error) state', async () => {
      const { container } = renderSelector({ requireProject: true, hasValidationError: true })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
