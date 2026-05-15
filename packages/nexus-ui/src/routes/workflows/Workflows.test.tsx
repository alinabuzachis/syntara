import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { executionsClient, workflowClient } from '../../client'
import { AlertProvider } from '../../providers/alerts'
import { assertUrlParam, assertUrlParamIsNull } from '../../test/filter-test-helpers'
import { accessClient } from '../access/accessClient'

import Workflows from './Workflows'

// Mock dependencies
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  executionsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn().mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useMutation: vi.fn(),
  },
}))

// Mock useProjectSelector — default to a single selected project so that:
// 1. projectSelectorReady is true (queries are enabled)
// 2. the flat table body is rendered (most tests expect flat rows)
const mockUseProjectSelector = vi.fn(() => ({
  selectedProject: { id: 'proj-default', name: 'Default Project' } as { id: string; name: string } | null,
  isAllProjects: false,
  projects: [{ id: 'proj-default', name: 'Default Project' }],
  ProjectSelector: null,
}))
vi.mock('../../hooks/useProjectSelector', () => ({
  useProjectSelector: () => mockUseProjectSelector(),
}))

const mockSetLocation = vi.fn()
const mockSetSearchParams = vi.fn()

let mockSearchParams = new URLSearchParams()

vi.mock('wouter', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useLocation: () => ['/workflows', mockSetLocation],
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  }
})

/** Sets the same return value on both workflowClient.useQuery and accessClient.useQuery */
function mockWorkflowQuery(returnValue: ReturnType<typeof workflowClient.useQuery>) {
  vi.mocked(workflowClient.useQuery).mockReturnValue(returnValue)
  vi.mocked(accessClient.useQuery).mockReturnValue(returnValue)
}

// Create a QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

describe('Workflows Component', () => {
  const mockWorkflows = [
    {
      id: '1',
      name: 'Important Project Workflow',
      description: 'Complex workflow for critical project',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
      is_enabled: true,
      labels: {
        type: 'critical',
        status: 'active',
      },
    },
    {
      id: '2',
      name: 'Secondary Team Workflow',
      description: 'Routine workflow for secondary tasks',
      created_at: '2023-02-01T00:00:00Z',
      updated_at: '2023-02-02T00:00:00Z',
      is_enabled: false,
      labels: {
        type: 'routine',
        status: 'maintenance',
      },
    },
  ]

  beforeEach(() => {
    // Reset mocks before each test
    mockSetSearchParams.mockClear()
    mockSearchParams = new URLSearchParams()
    const defaultQueryReturn = {
      data: {
        resources: mockWorkflows,
        next: null,
        prev: null,
        total: mockWorkflows.length,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    mockWorkflowQuery(defaultQueryReturn)

    const defaultMutationReturn = {
      mutateAsync: vi.fn(),
      reset: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      isIdle: true,
      error: null,
      data: undefined,
      variables: undefined,
      context: undefined,
      failureCount: 0,
      failureReason: null,
      status: 'idle' as const,
      submittedAt: 0,
    }

    // Mock executionsClient.useMutation for execute workflow
    vi.mocked(executionsClient.useMutation).mockReturnValue({
      ...defaultMutationReturn,
      mutate: vi.fn(
        (
          body: unknown,
          callbacks?: { onSuccess?: (...args: unknown[]) => void; onError?: (...args: unknown[]) => void }
        ) => {
          if (callbacks?.onSuccess) {
            callbacks.onSuccess({}, body, undefined)
          }
        }
      ),
    })

    // Mock workflowClient.useMutation for delete workflow
    vi.mocked(workflowClient.useMutation).mockReturnValue({
      ...defaultMutationReturn,
      mutate: vi.fn(),
    })
  })

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<Workflows />, { wrapper })

      // Check page header
      expect(screen.getByText('Workflows')).toBeInTheDocument()

      // Check table is rendered
      expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
    })

    it('renders Create workflow button before Import workflow in toolbar', () => {
      render(<Workflows />, { wrapper })

      const createButton = screen.getByRole('button', { name: 'Create workflow' })
      const importButton = screen.getByRole('button', { name: 'Import workflow' })

      // Create workflow (primary) must precede Import workflow (secondary) in the DOM per UX skill
      expect(createButton.compareDocumentPosition(importButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('renders workflows in the table', async () => {
      render(<Workflows />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Check workflow names are rendered
      expect(screen.getByText('Important Project Workflow')).toBeInTheDocument()
      expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
    })
  })

  describe('Filter Functionality', () => {
    it('renders FilterBar component without keyword search', () => {
      render(<Workflows />, { wrapper })

      // FilterBar should be present but keyword search input should not
      expect(screen.queryByPlaceholderText('Search workflows...')).not.toBeInTheDocument()

      // Table should still render
      expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
    })

    it('shows all workflows when no filters are active', async () => {
      render(<Workflows />, { wrapper })

      // Wait for table to render
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // All workflows should be visible
      expect(screen.getByText('Important Project Workflow')).toBeInTheDocument()
      expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
    })

    it('applies name filter to API query when typing and submitting', async () => {
      const user = userEvent.setup()
      render(<Workflows />, { wrapper })

      const nameInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(nameInput, 'deploy')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        assertUrlParam(mockSetSearchParams, 'name[contains]', 'deploy')
      })
      expect(mockSetSearchParams).toHaveBeenCalled()
    })

    it('applies state filter (is_enabled) to API query when selecting option', async () => {
      const user = userEvent.setup()
      render(<Workflows />, { wrapper })

      // Switch to state filter - find the field selector toggle (first button with "Name")
      const fieldButtons = screen.getAllByRole('button', { name: 'Name' })
      const fieldSelector = fieldButtons[0] // First "Name" button is the filter field selector
      await user.click(fieldSelector)
      await user.click(await screen.findByRole('option', { name: /state/i }))

      // Select "Enabled"
      const stateButton = await screen.findByRole('button', { name: /filter by state/i })
      await user.click(stateButton)
      await user.click(await screen.findByRole('option', { name: 'Enabled' }))

      await waitFor(() => {
        assertUrlParam(mockSetSearchParams, 'is_enabled', 'true')
      })
      expect(mockSetSearchParams).toHaveBeenCalled()
    })

    it('resets pagination cursor when filters change', async () => {
      const user = userEvent.setup()

      // Start with pagination cursor in URL
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: 'next-cursor',
          prev: 'prev-cursor',
          total: 25,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Workflows />, { wrapper })

      // Apply a filter
      const nameInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(nameInput, 'test')
      await user.keyboard('{Enter}')

      // Verify cursor was reset
      await waitFor(() => {
        assertUrlParamIsNull(mockSetSearchParams, 'cursor')
      })
      expect(mockSetSearchParams).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('displays loading state', () => {
      const loadingReturn = {
        data: null,
        isPending: true,
        isError: false,
        error: null,
      }
      mockWorkflowQuery(loadingReturn)

      render(<Workflows />, { wrapper })

      // Expect loading state
      const loadingElement = screen.getByTestId('loading-state')
      expect(loadingElement).toBeInTheDocument()
    })

    it('displays error state', () => {
      const mockError = new Error('Failed to load workflows')
      // NOTE: component may re-render due to AlertProvider updates; keep error stable across renders
      mockWorkflowQuery({
        data: null,
        isPending: false,
        isError: true,
        error: mockError,
      })

      render(<Workflows />, { wrapper })

      // Check for error state
      const errorElement = screen.getByTestId('error-state')
      expect(errorElement).toBeInTheDocument()
      // Title also appears in the global alert; scope to the error state container
      expect(within(errorElement).getByText('Error loading workflows')).toBeInTheDocument()
    })
  })

  describe('Table Columns', () => {
    it('renders name column with clickable links that navigate', () => {
      render(<Workflows />, { wrapper })

      const workflowNode = screen.getByText('Important Project Workflow')
      expect(workflowNode).toBeInTheDocument()

      // Click the link button and verify navigation
      fireEvent.click(workflowNode)
      expect(mockSetLocation).toHaveBeenCalledWith('/workflow-builder/1')
    })

    it('renders tags column with label keys from workflow.labels', () => {
      render(<Workflows />, { wrapper })

      // Tags column shows label keys (mock workflows have labels: { type, status } per row)
      expect(screen.getAllByText('type').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('status').length).toBeGreaterThanOrEqual(1)
    })

    it('renders tags column from workflow.labels (tags stored as label keys)', () => {
      const workflowsWithTags = [
        {
          id: '1',
          name: 'Tagged Workflow',
          description: 'Has tags as labels',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          is_enabled: true,
          labels: { deploy: '', prod: '' },
        },
      ]
      mockWorkflowQuery({
        data: {
          resources: workflowsWithTags,
          next: null,
          prev: null,
          total: 1,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Workflows />, { wrapper })

      expect(screen.getByText('deploy')).toBeInTheDocument()
      expect(screen.getByText('prod')).toBeInTheDocument()
    })
  })

  describe('Execute Workflow Row Action', () => {
    it('shows success alert when workflow executes successfully', async () => {
      const mockMutate = vi.fn(
        (
          body: unknown,
          callbacks?: { onSuccess?: (...args: unknown[]) => void; onError?: (...args: unknown[]) => void }
        ) => {
          if (callbacks?.onSuccess) {
            callbacks.onSuccess({}, body, undefined)
          }
        }
      )

      vi.mocked(executionsClient.useMutation).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        isIdle: true,
        error: null,
        data: undefined,
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        status: 'idle',
        submittedAt: 0,
      })

      render(<Workflows />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run workflow" menu item
      const runWorkflowItem = await screen.findByText('Run workflow')
      fireEvent.click(runWorkflowItem)

      // Wait for confirmation dialog to appear and click "Run now" button
      const runButton = await screen.findByRole('button', { name: /^Run now$/i })
      fireEvent.click(runButton)

      // Verify the mutation was called with correct parameters
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          { body: { workflow_id: '1', input_data: {} } },
          expect.objectContaining({
            onSuccess: expect.any(Function) as unknown,
            onError: expect.any(Function) as unknown,
          })
        )
      })

      // Verify success alert is shown
      await waitFor(() => {
        expect(screen.getByText('Workflow started')).toBeInTheDocument()
        expect(screen.getByText(/Successfully started workflow "Important Project Workflow"/)).toBeInTheDocument()
      })
    })

    it('shows error alert when workflow execution fails', async () => {
      const mockError = new Error('Network error')
      const mockMutate = vi.fn(
        (
          body: unknown,
          callbacks?: { onSuccess?: (...args: unknown[]) => void; onError?: (...args: unknown[]) => void }
        ) => {
          if (callbacks?.onError) {
            callbacks.onError(mockError, body, undefined)
          }
        }
      )

      vi.mocked(executionsClient.useMutation).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        isIdle: true,
        error: null,
        data: undefined,
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        status: 'idle',
        submittedAt: 0,
      })

      render(<Workflows />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run workflow" menu item
      const runWorkflowItem = await screen.findByText('Run workflow')
      fireEvent.click(runWorkflowItem)

      // Wait for confirmation dialog to appear and click "Run now" button
      const runButton = await screen.findByRole('button', { name: /^Run now$/i })
      fireEvent.click(runButton)

      // Verify the mutation was called
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })

      // Verify error alert is shown
      await waitFor(() => {
        expect(screen.getByText('Workflow failed')).toBeInTheDocument()
        expect(
          screen.getByText(/Failed to start workflow "Important Project Workflow": Network error/)
        ).toBeInTheDocument()
      })
    })

    it('shows error alert with generic message when error has no message', async () => {
      const mockError = {} // Error without message property
      const mockMutate = vi.fn(
        (
          body: unknown,
          callbacks?: { onSuccess?: (...args: unknown[]) => void; onError?: (...args: unknown[]) => void }
        ) => {
          if (callbacks?.onError) {
            callbacks.onError(mockError, body, undefined)
          }
        }
      )

      vi.mocked(executionsClient.useMutation).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        isIdle: true,
        error: null,
        data: undefined,
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        status: 'idle',
        submittedAt: 0,
      })

      render(<Workflows />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run workflow" menu item
      const runWorkflowItem = await screen.findByText('Run workflow')
      fireEvent.click(runWorkflowItem)

      // Wait for confirmation dialog to appear and click "Run now" button
      const runButton = await screen.findByRole('button', { name: /^Run now$/i })
      fireEvent.click(runButton)

      // Verify error alert is shown with generic message
      await waitFor(() => {
        expect(screen.getByText('Workflow failed')).toBeInTheDocument()
        expect(
          screen.getByText(/Failed to start workflow "Important Project Workflow": An unexpected error occurred/)
        ).toBeInTheDocument()
      })
    })

    it('shows confirmation dialog when running workflow', async () => {
      render(<Workflows />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run workflow" menu item
      const runWorkflowItem = await screen.findByText('Run workflow')
      fireEvent.click(runWorkflowItem)

      // Verify confirmation dialog is shown
      await waitFor(() => {
        expect(screen.getByText('Run Important Project Workflow?')).toBeInTheDocument()
        expect(
          screen.getByText(
            /You are about to manually run this workflow. This action will start the workflow immediately, bypassing its normal trigger conditions./
          )
        ).toBeInTheDocument()
      })

      // Verify Run now and Cancel buttons are present
      expect(screen.getByRole('button', { name: /^Run now$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    })

    it('cancels workflow run when cancel button is clicked', async () => {
      const mockMutate = vi.fn()

      vi.mocked(executionsClient.useMutation).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        isIdle: true,
        error: null,
        data: undefined,
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        status: 'idle',
        submittedAt: 0,
      })

      render(<Workflows />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run workflow" menu item
      const runWorkflowItem = await screen.findByText('Run workflow')
      fireEvent.click(runWorkflowItem)

      // Wait for confirmation dialog to appear and click "Cancel" button
      const cancelButton = await screen.findByRole('button', { name: /Cancel/i })
      fireEvent.click(cancelButton)

      // Verify the mutation was not called
      await waitFor(() => {
        expect(mockMutate).not.toHaveBeenCalled()
      })

      // Verify dialog is closed
      await waitFor(() => {
        expect(screen.queryByText('Run Important Project Workflow?')).not.toBeInTheDocument()
      })
    })

    it('navigates to executions page filtered by workflow when "View run history" is clicked', async () => {
      mockSetLocation.mockClear()

      render(<Workflows />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "View run history" menu item
      const viewRunHistoryItem = await screen.findByText('View run history')
      fireEvent.click(viewRunHistoryItem)

      // Verify navigation to executions page with workflow filter
      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/executions?workflow_id=1')
      })
    })
  })

  describe('Pagination', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('displays pagination controls when next or prev cursors are available', () => {
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: 'next-cursor-xyz',
          prev: null,
          total: 30,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Workflows />, { wrapper })

      const nextButton = screen.getByRole('button', { name: 'Go to next page' })
      const prevButton = screen.getByRole('button', { name: 'Go to previous page' })

      expect(nextButton).toBeInTheDocument()
      expect(prevButton).toBeInTheDocument()
      expect(nextButton).not.toBeDisabled()
      expect(prevButton).toBeDisabled()
    })

    it('displays total count when available', () => {
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: 'next-cursor',
          prev: null,
          total: 30,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Workflows />, { wrapper })

      // PF Pagination renders items range and total in a toggle (text split across <b> tags)
      const pagination = screen.getByRole('navigation', { name: /pagination/i })
      expect(pagination).toBeInTheDocument()
      expect(screen.getByText('1 - 20')).toBeInTheDocument()
      expect(screen.getByText((content, element) => element?.tagName === 'B' && content === '30')).toBeInTheDocument()
    })

    it('enables both buttons when both cursors are available', () => {
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: 'next-cursor',
          prev: 'prev-cursor-xyz',
          total: 50,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Workflows />, { wrapper })

      // Navigate to page 2 so both prev and next are enabled
      fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))

      const nextButton = screen.getByRole('button', { name: 'Go to next page' })
      const prevButton = screen.getByRole('button', { name: 'Go to previous page' })

      expect(nextButton).not.toBeDisabled()
      expect(prevButton).not.toBeDisabled()
    })

    it('hides pagination when no cursors are available', () => {
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: null,
          prev: null,
          total: 3,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Workflows />, { wrapper })

      expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument()
    })

    it('handles navigation back to first page correctly', async () => {
      // Start with data that has a next cursor so we can navigate forward
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: 'next-cursor',
          prev: null,
          total: 40,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      const { rerender } = render(<Workflows />, { wrapper })

      // Navigate to page 2
      fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))

      // Now simulate being on last page with only prev cursor available
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: null,
          prev: 'cursor-page1',
          total: 40,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })
      rerender(<Workflows />)

      const prevButton = await screen.findByRole('button', { name: 'Go to previous page' })

      // Previous should be enabled (we're on page 2)
      expect(prevButton).not.toBeDisabled()

      // Clicking previous should work without errors
      expect(() => fireEvent.click(prevButton)).not.toThrow()
    })

    it('does not reset cursor while query is fetching', async () => {
      // Mock initial state with data and next cursor
      const mockRefetch = vi.fn()
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: 'next-cursor',
          prev: null,
          total: 30,
        },
        isPending: false,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      })

      render(<Workflows />, { wrapper })

      // Verify pagination controls present
      const nextButton = screen.getByRole('button', { name: 'Go to next page' })
      expect(nextButton).toBeInTheDocument()

      // Click Next to set internal cursor state
      fireEvent.click(nextButton)

      // Now simulate fetching state (cursor should NOT be reset while isFetching)
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: 'next-cursor',
          prev: 'prev-cursor',
          total: 30,
        },
        isPending: false,
        isLoading: false,
        isFetching: true, // Fetching prevents cursor reset
        isError: false,
        error: null,
        refetch: mockRefetch,
      })

      // Force re-render to trigger useEffect with new query state
      fireEvent.click(nextButton)

      // Verify pagination controls still present (cursor was not reset despite empty data)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Go to next page' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeInTheDocument()
      })
    })

    it('resets cursor when data is empty and query is not fetching', async () => {
      const mockRefetch = vi.fn()

      // Start with data
      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: 'next-cursor',
          prev: null,
          total: 30,
        },
        isPending: false,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      })

      const { rerender } = render(<Workflows />, { wrapper })

      // Simulate truly empty state - no data and not fetching
      mockWorkflowQuery({
        data: {
          resources: [],
          next: null,
          prev: null,
          total: 0,
        },
        isPending: false,
        isLoading: false,
        isFetching: false, // Not fetching allows cursor reset
        isError: false,
        error: null,
        refetch: mockRefetch,
      })

      rerender(<Workflows />)

      // Should show empty state (cursor was reset)
      await waitFor(() => {
        expect(screen.getByText('No workflows yet')).toBeInTheDocument()
      })
    })
  })

  describe('Delete Workflow', () => {
    it('shows delete option in row actions menu', async () => {
      render(<Workflows />, { wrapper })

      // Wait for table to render
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Open the actions menu
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Verify delete option exists
      await waitFor(() => {
        expect(screen.getByText('Delete workflow')).toBeInTheDocument()
      })
    })

    it('opens delete confirmation dialog when delete is clicked', async () => {
      render(<Workflows />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Open actions menu
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Click delete
      const deleteItem = await screen.findByText('Delete workflow')
      fireEvent.click(deleteItem)

      // Verify modal is shown
      await waitFor(() => {
        expect(screen.getByText('Delete workflow?')).toBeInTheDocument()
        expect(screen.getByText(/will be deleted. This cannot be undone/)).toBeInTheDocument()
        expect(screen.getByText(/This workflow will stop running immediately/)).toBeInTheDocument()
      })
    })

    it('deletes workflow successfully and shows success alert', async () => {
      const mockRefetch = vi.fn()
      const mockDeleteMutate = vi.fn(
        (
          params: unknown,
          callbacks?: { onSuccess?: (...args: unknown[]) => void; onError?: (...args: unknown[]) => void }
        ) => {
          if (callbacks?.onSuccess) {
            callbacks.onSuccess(undefined, params, undefined)
          }
        }
      )

      mockWorkflowQuery({
        data: {
          resources: mockWorkflows,
          next: null,
          prev: null,
          total: mockWorkflows.length,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      })

      vi.mocked(workflowClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        mutateAsync: vi.fn(),
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        isIdle: true,
        error: null,
        data: undefined,
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        status: 'idle',
        submittedAt: 0,
      })

      render(<Workflows />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Open actions menu and click delete
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      const deleteItem = await screen.findByText('Delete workflow')
      fireEvent.click(deleteItem)

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getByText('Delete workflow?')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('checkbox', { name: /I understand this workflow/ }))
      const deleteButton = screen.getByRole('button', { name: 'Delete' })
      fireEvent.click(deleteButton)

      // Verify success
      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalled()
        expect(mockRefetch).toHaveBeenCalled()
        expect(screen.getByText('Workflow deleted')).toBeInTheDocument()
        expect(screen.getByText(/Successfully deleted workflow/)).toBeInTheDocument()
      })
    })

    it('handles delete error and shows error alert', async () => {
      const mockError = { message: 'Delete failed' }
      const mockDeleteMutate = vi.fn(
        (
          params: unknown,
          callbacks?: { onSuccess?: (...args: unknown[]) => void; onError?: (...args: unknown[]) => void }
        ) => {
          if (callbacks?.onError) {
            callbacks.onError(mockError, params, undefined)
          }
        }
      )

      vi.mocked(workflowClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        mutateAsync: vi.fn(),
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        isIdle: true,
        error: null,
        data: undefined,
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        status: 'idle',
        submittedAt: 0,
      })

      render(<Workflows />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Open actions menu and click delete
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      const deleteItem = await screen.findByText('Delete workflow')
      fireEvent.click(deleteItem)

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getByText('Delete workflow?')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('checkbox', { name: /I understand this workflow/ }))
      const deleteButton = screen.getByRole('button', { name: 'Delete' })
      fireEvent.click(deleteButton)

      // Verify error alert
      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalled()
        expect(screen.getByText('Delete failed')).toBeInTheDocument()
        expect(screen.getByText(/Failed to delete workflow/)).toBeInTheDocument()
      })
    })

    it('can cancel delete operation', async () => {
      render(<Workflows />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Open actions menu and click delete
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      const deleteItem = await screen.findByText('Delete workflow')
      fireEvent.click(deleteItem)

      // Modal appears
      await waitFor(() => {
        expect(screen.getByText('Delete workflow?')).toBeInTheDocument()
      })

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      // Modal closes
      await waitFor(() => {
        expect(screen.queryByText('Delete workflow?')).not.toBeInTheDocument()
      })
    })
  })

  describe('Empty States', () => {
    it('shows EmptyStateNoData when no workflows and no active filters', () => {
      mockWorkflowQuery({
        data: {
          resources: [],
          next: null,
          prev: null,
          total: 0,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      })

      render(<Workflows />, { wrapper })

      expect(screen.getByText('No workflows yet')).toBeInTheDocument()
      expect(screen.getByText('Create your first workflow to get started.')).toBeInTheDocument()
      // Both the header and empty state have "Create workflow" buttons
      const createButtons = screen.getAllByRole('button', { name: 'Create workflow' })
      expect(createButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('navigates to builder when empty state "Create workflow" button is clicked', async () => {
      const user = userEvent.setup()
      mockSetLocation.mockClear()

      mockWorkflowQuery({
        data: {
          resources: [],
          next: null,
          prev: null,
          total: 0,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      })

      render(<Workflows />, { wrapper })

      // Both the header and empty state have "Create workflow" buttons; click the last one (empty state)
      const createButtons = screen.getAllByRole('button', { name: 'Create workflow' })
      await user.click(createButtons[createButtons.length - 1])

      expect(mockSetLocation).toHaveBeenCalledWith('/workflow-builder/new')
    })

    it('shows EmptyStateFilter when active filters return no results', () => {
      // Set up URL to have an active filter
      mockSearchParams = new URLSearchParams('name%5Bcontains%5D=nonexistent')

      mockWorkflowQuery({
        data: {
          resources: [],
          next: null,
          prev: null,
          total: 0,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      })

      render(<Workflows />, { wrapper })

      // Should show EmptyStateFilter (not EmptyStateNoData) because filters are active
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })
  })

  describe('Run workflow with navigation', () => {
    it('navigates to execution detail page on successful run when response has id', async () => {
      mockSetLocation.mockClear()
      const mockMutate = vi.fn(
        (
          body: unknown,
          callbacks?: { onSuccess?: (...args: unknown[]) => void; onError?: (...args: unknown[]) => void }
        ) => {
          if (callbacks?.onSuccess) {
            callbacks.onSuccess({ id: 'exec-123' }, body, undefined)
          }
        }
      )

      vi.mocked(executionsClient.useMutation).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        isIdle: true,
        error: null,
        data: undefined,
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        status: 'idle',
        submittedAt: 0,
      })

      render(<Workflows />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Open actions menu and click "Run workflow"
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      const runItem = await screen.findByText('Run workflow')
      fireEvent.click(runItem)

      const runButton = await screen.findByRole('button', { name: /^Run now$/i })
      fireEvent.click(runButton)

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/executions/exec-123')
      })
    })
  })

  describe('Delete workflow settled behavior', () => {
    it('closes dialog and clears workflow on settled (success)', async () => {
      const mockDeleteMutate = vi.fn(
        (
          params: unknown,
          callbacks?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          callbacks?.onSuccess?.(undefined, params, undefined)
          callbacks?.onSettled?.()
        }
      )

      vi.mocked(workflowClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        mutateAsync: vi.fn(),
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        isIdle: true,
        error: null,
        data: undefined,
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        status: 'idle',
        submittedAt: 0,
      })

      render(<Workflows />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      // Open actions menu and click delete
      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      const deleteItem = await screen.findByText('Delete workflow')
      fireEvent.click(deleteItem)

      await waitFor(() => {
        expect(screen.getByText('Delete workflow?')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('checkbox', { name: /I understand this workflow/ }))
      const deleteButton = screen.getByRole('button', { name: 'Delete' })
      fireEvent.click(deleteButton)

      // After onSettled, the delete dialog should be closed
      await waitFor(() => {
        expect(screen.queryByText('Delete workflow?')).not.toBeInTheDocument()
      })
    })

    it('closes dialog and clears workflow on settled (error)', async () => {
      const mockDeleteMutate = vi.fn(
        (
          params: unknown,
          callbacks?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          callbacks?.onError?.(new Error('fail'), params, undefined)
          callbacks?.onSettled?.()
        }
      )

      vi.mocked(workflowClient.useMutation).mockReturnValue({
        mutate: mockDeleteMutate,
        mutateAsync: vi.fn(),
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        isIdle: true,
        error: null,
        data: undefined,
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        status: 'idle',
        submittedAt: 0,
      })

      render(<Workflows />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Workflows table' })).toBeInTheDocument()
      })

      const table = screen.getByRole('grid', { name: 'Workflows table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      const deleteItem = await screen.findByText('Delete workflow')
      fireEvent.click(deleteItem)

      await waitFor(() => {
        expect(screen.getByText('Delete workflow?')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('checkbox', { name: /I understand this workflow/ }))
      const deleteButton = screen.getByRole('button', { name: 'Delete' })
      fireEvent.click(deleteButton)

      // After onSettled, the delete dialog should be closed even on error
      await waitFor(() => {
        expect(screen.queryByText('Delete workflow?')).not.toBeInTheDocument()
      })
    })
  })

  describe('Grouped view (All Projects)', () => {
    it('renders grouped workflows when all projects are selected', () => {
      mockUseProjectSelector.mockReturnValue({
        selectedProject: null,
        isAllProjects: true,
        projects: [
          { id: 'proj-1', name: 'Project Alpha' },
          { id: 'proj-2', name: 'Project Beta' },
        ],
        ProjectSelector: null,
      })

      const workflowsWithProjects = [
        {
          id: '1',
          name: 'Workflow A',
          description: '',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          is_enabled: true,
          labels: {},
          project_id: 'proj-1',
        },
        {
          id: '2',
          name: 'Workflow B',
          description: '',
          created_at: '2023-02-01T00:00:00Z',
          updated_at: '2023-02-02T00:00:00Z',
          is_enabled: false,
          labels: {},
          project_id: 'proj-2',
        },
      ]

      mockWorkflowQuery({
        data: {
          resources: workflowsWithProjects,
          next: null,
          prev: null,
          total: 2,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Workflows />, { wrapper })

      // Grouped view shows project names as group headers
      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      expect(screen.getByText('Project Beta')).toBeInTheDocument()

      // Workflows should still be rendered
      expect(screen.getByText('Workflow A')).toBeInTheDocument()
      expect(screen.getByText('Workflow B')).toBeInTheDocument()
    })

    it('toggles project group collapsed/expanded', async () => {
      const user = userEvent.setup()

      mockUseProjectSelector.mockReturnValue({
        selectedProject: null,
        isAllProjects: true,
        projects: [{ id: 'proj-1', name: 'Project Alpha' }],
        ProjectSelector: null,
      })

      const workflowsWithProjects = [
        {
          id: '1',
          name: 'Workflow A',
          description: '',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          is_enabled: true,
          labels: {},
          project_id: 'proj-1',
        },
      ]

      mockWorkflowQuery({
        data: {
          resources: workflowsWithProjects,
          next: null,
          prev: null,
          total: 1,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Workflows />, { wrapper })

      // Project group header should be visible
      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      // Workflow should be visible (expanded by default)
      expect(screen.getByText('Workflow A')).toBeInTheDocument()

      // Click the project group header to collapse
      await user.click(screen.getByText('Project Alpha'))

      // Workflow should be hidden (collapsed)
      expect(screen.queryByText('Workflow A')).not.toBeInTheDocument()

      // Click again to expand
      await user.click(screen.getByText('Project Alpha'))

      // Workflow should be visible again
      expect(screen.getByText('Workflow A')).toBeInTheDocument()
    })
  })

  describe('Project filtering', () => {
    it('renders correctly when a project is selected', () => {
      mockUseProjectSelector.mockReturnValue({
        selectedProject: { id: 'proj-1', name: 'Project Alpha' },
        isAllProjects: false,
        projects: [{ id: 'proj-1', name: 'Project Alpha' }],
        ProjectSelector: null,
      })

      render(<Workflows />, { wrapper })

      // Query is called with cursor pagination params
      expect(workflowClient.useQuery).toHaveBeenCalledWith(
        'get',
        '/workflows',
        expect.objectContaining({
          params: {
            query: expect.objectContaining({
              limit: 20,
              include_total: true,
            }) as unknown,
          },
        }) as unknown,
        expect.objectContaining({ enabled: false }) as unknown
      )
    })
  })

  describe('Singular/plural workflow count', () => {
    it('shows singular "workflow" for exactly one result', () => {
      const singleResult = {
        data: {
          resources: [mockWorkflows[0]],
          next: null,
          prev: null,
          total: 1,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      }
      mockWorkflowQuery(singleResult)

      render(<Workflows />, { wrapper })

      // PF Pagination renders items range in <b> tags: "<b>1 - 1</b> of <b>1</b> items"
      expect(screen.getByText('1 - 1')).toBeInTheDocument()
    })
  })

  // NOTE: Sorting tests removed - client-side sorting disabled for cursor-paginated data
})
