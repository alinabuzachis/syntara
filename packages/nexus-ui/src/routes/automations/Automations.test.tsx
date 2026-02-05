import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { workflowClient } from '../../client'
import { AlertProvider } from '../../components/alerts'

import Automations from './Automations'

// Mock dependencies
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

const mockSetLocation = vi.fn()

vi.mock('wouter', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useLocation: () => ['/automations', mockSetLocation],
  }
})

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

describe('Automations Component', () => {
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
    vi.mocked(workflowClient.useQuery).mockReturnValue({
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
    })

    // Mock mutation for execute automation
    vi.mocked(workflowClient.useMutation).mockReturnValue({
      mutate: vi.fn((body, callbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({}, body, undefined)
        }
      }),
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
  })

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<Automations />, { wrapper })

      // Check page header
      expect(screen.getByText('Automations')).toBeInTheDocument()

      // Check search input
      const searchInput = screen.getByPlaceholderText('Search automations...')
      expect(searchInput).toBeInTheDocument()
    })

    it('renders workflows in the table', async () => {
      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Check workflow names are rendered
      expect(screen.getByText('Important Project Workflow')).toBeInTheDocument()
      expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    it('allows searching workflows', () => {
      render(<Automations />, { wrapper })

      // Find the search input
      const searchInput = screen.getByPlaceholderText('Search automations...')

      // Simulate typing in the search input
      const searchTerm = 'project'
      fireEvent.change(searchInput, { target: { value: searchTerm } })

      // Verify the input value is updated
      expect(searchInput.value).toBe(searchTerm)
    })

    it('filters workflows with fuzzy search, prioritizing most relevant', async () => {
      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Find the search input
      const searchInput = screen.getByPlaceholderText('Search automations...')

      // Simulate searching for "project"
      fireEvent.change(searchInput, { target: { value: 'project' } })

      // Wait for filtered results
      await waitFor(() => {
        // Get all table rows (PF Table uses role="grid")
        const table = screen.getByRole('grid', { name: 'Automations table' })
        const rows = within(table).getAllByRole('row')

        // Verify row count (header + at least 1 data row)
        expect(rows.length).toBeGreaterThanOrEqual(2)

        // The most relevant row (containing "project") should be the first data row
        const firstDataRow = rows[1]
        expect(within(firstDataRow).getByText('Important Project Workflow')).toBeInTheDocument()

        // Verify the other workflow is not visible
        expect(screen.queryByText('Secondary Team Workflow')).not.toBeInTheDocument()
      })
    })

    it('supports partial matches in fuzzy search', async () => {
      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Find the search input
      const searchInput = screen.getByPlaceholderText('Search automations...')

      // Simulate searching for "team"
      fireEvent.change(searchInput, { target: { value: 'team' } })

      // Wait for filtered results
      await waitFor(() => {
        // Get all table rows (PF Table uses role="grid")
        const table = screen.getByRole('grid', { name: 'Automations table' })
        const rows = within(table).getAllByRole('row')

        // Verify row count (header + at least 1 data row)
        expect(rows.length).toBeGreaterThanOrEqual(2)

        // The row with "team" should be visible
        expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
      })
    })

    it('shows all workflows when search is empty', async () => {
      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Find the search input
      const searchInput = screen.getByPlaceholderText('Search automations...')

      // Clear the search input
      fireEvent.change(searchInput, { target: { value: '' } })

      // Wait for results
      await waitFor(() => {
        // Get all table rows (PF Table uses role="grid")
        const table = screen.getByRole('grid', { name: 'Automations table' })
        const rows = within(table).getAllByRole('row')

        // Verify all rows are shown (header + 2 data rows)
        expect(rows.length).toBeGreaterThanOrEqual(3)
        expect(within(rows[1]).getByText('Important Project Workflow')).toBeInTheDocument()
        expect(within(rows[2]).getByText('Secondary Team Workflow')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('displays loading state', () => {
      vi.mocked(workflowClient.useQuery).mockReturnValueOnce({
        data: null,
        isPending: true,
        isError: false,
        error: null,
      })

      render(<Automations />, { wrapper })

      // Expect loading state
      const loadingElement = screen.getByTestId('loading-state')
      expect(loadingElement).toBeInTheDocument()
    })

    it('displays error state', () => {
      const mockError = new Error('Failed to load workflows')
      // NOTE: component may re-render due to AlertProvider updates; keep error stable across renders
      vi.mocked(workflowClient.useQuery).mockReturnValue({
        data: null,
        isPending: false,
        isError: true,
        error: mockError,
      })

      render(<Automations />, { wrapper })

      // Check for error state
      const errorElement = screen.getByTestId('error-state')
      expect(errorElement).toBeInTheDocument()
      // Title also appears in the global alert; scope to the error state container
      expect(within(errorElement).getByText('Error loading workflows')).toBeInTheDocument()
    })
  })

  describe('Table Columns', () => {
    it('renders name column with clickable links that navigate', () => {
      render(<Automations />, { wrapper })

      const workflowNode = screen.getByText('Important Project Workflow')
      expect(workflowNode).toBeInTheDocument()

      // Click the link button and verify navigation
      fireEvent.click(workflowNode)
      expect(mockSetLocation).toHaveBeenCalledWith('/automation-builder/1')
    })

    it('renders labels column', () => {
      render(<Automations />, { wrapper })

      // Get all labels
      const labelElements = screen.getAllByText(/type=critical|status=active|type=routine|status=maintenance/i)

      // Verify labels are present
      expect(labelElements.length).toBeGreaterThanOrEqual(4)
      expect(screen.getByText('type=critical')).toBeInTheDocument()
      expect(screen.getByText('status=active')).toBeInTheDocument()
      expect(screen.getByText('type=routine')).toBeInTheDocument()
      expect(screen.getByText('status=maintenance')).toBeInTheDocument()
    })
  })

  describe('Execute Automation Row Action', () => {
    it('shows success alert when automation executes successfully', async () => {
      const mockMutate = vi.fn((body, callbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({}, body, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockReturnValue({
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

      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run automation" menu item
      const runAutomationItem = await screen.findByText('Run automation')
      fireEvent.click(runAutomationItem)

      // Wait for confirmation dialog to appear and click "Run now" button
      const runButton = await screen.findByRole('button', { name: /^Run now$/i })
      fireEvent.click(runButton)

      // Verify the mutation was called with correct parameters
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          { body: { workflow_id: '1', input_data: {} } },
          expect.objectContaining({
            onSuccess: expect.any(Function),
            onError: expect.any(Function),
          })
        )
      })

      // Verify success alert is shown
      await waitFor(() => {
        expect(screen.getByText('Automation Started')).toBeInTheDocument()
        expect(screen.getByText(/Successfully started automation "Important Project Workflow"/)).toBeInTheDocument()
      })
    })

    it('shows error alert when automation execution fails', async () => {
      const mockError = new Error('Network error')
      const mockMutate = vi.fn((body, callbacks) => {
        if (callbacks?.onError) {
          callbacks.onError(mockError, body, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockReturnValue({
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

      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run automation" menu item
      const runAutomationItem = await screen.findByText('Run automation')
      fireEvent.click(runAutomationItem)

      // Wait for confirmation dialog to appear and click "Run now" button
      const runButton = await screen.findByRole('button', { name: /^Run now$/i })
      fireEvent.click(runButton)

      // Verify the mutation was called
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })

      // Verify error alert is shown
      await waitFor(() => {
        expect(screen.getByText('Automation Failed')).toBeInTheDocument()
        expect(
          screen.getByText(/Failed to start automation "Important Project Workflow": Network error/)
        ).toBeInTheDocument()
      })
    })

    it('shows error alert with generic message when error has no message', async () => {
      const mockError = {} // Error without message property
      const mockMutate = vi.fn((body, callbacks) => {
        if (callbacks?.onError) {
          callbacks.onError(mockError, body, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockReturnValue({
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

      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run automation" menu item
      const runAutomationItem = await screen.findByText('Run automation')
      fireEvent.click(runAutomationItem)

      // Wait for confirmation dialog to appear and click "Run now" button
      const runButton = await screen.findByRole('button', { name: /^Run now$/i })
      fireEvent.click(runButton)

      // Verify error alert is shown with generic message
      await waitFor(() => {
        expect(screen.getByText('Automation Failed')).toBeInTheDocument()
        expect(
          screen.getByText(/Failed to start automation "Important Project Workflow": An unexpected error occurred/)
        ).toBeInTheDocument()
      })
    })

    it('shows confirmation dialog when running automation', async () => {
      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run automation" menu item
      const runAutomationItem = await screen.findByText('Run automation')
      fireEvent.click(runAutomationItem)

      // Verify confirmation dialog is shown
      await waitFor(() => {
        expect(screen.getByText('Run Important Project Workflow?')).toBeInTheDocument()
        expect(
          screen.getByText(
            /You are about to manually run this automation. This action will start the automation immediately, bypassing its normal trigger conditions./
          )
        ).toBeInTheDocument()
      })

      // Verify Run now and Cancel buttons are present
      expect(screen.getByRole('button', { name: /^Run now$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    })

    it('cancels automation run when cancel button is clicked', async () => {
      const mockMutate = vi.fn()

      vi.mocked(workflowClient.useMutation).mockReturnValue({
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

      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the actions menu button)
      // Actions column is always the last column, so the actions button is the last button in the row
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Wait for menu to open and click the "Run automation" menu item
      const runAutomationItem = await screen.findByText('Run automation')
      fireEvent.click(runAutomationItem)

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

      render(<Automations />, { wrapper })

      // Wait for table to render (PF Table uses role="grid")
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('grid', { name: 'Automations table' })
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
      vi.mocked(workflowClient.useQuery).mockReturnValue({
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

      render(<Automations />, { wrapper })

      const nextButton = screen.getByRole('button', { name: 'Next page' })
      const prevButton = screen.getByRole('button', { name: 'Previous page' })

      expect(nextButton).toBeInTheDocument()
      expect(prevButton).toBeInTheDocument()
      expect(nextButton).not.toBeDisabled()
      expect(prevButton).toBeDisabled()
    })

    it('displays total count when available', () => {
      vi.mocked(workflowClient.useQuery).mockReturnValue({
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

      render(<Automations />, { wrapper })

      expect(screen.getByText(/2 automations/)).toBeInTheDocument()
      expect(screen.getByText(/\(of 30 total\)/)).toBeInTheDocument()
    })

    it('enables both buttons when both cursors are available', () => {
      vi.mocked(workflowClient.useQuery).mockReturnValue({
        data: {
          resources: mockWorkflows,
          next: 'next-cursor',
          prev: 'prev-cursor-xyz',
          total: 30,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Automations />, { wrapper })

      const nextButton = screen.getByRole('button', { name: 'Next page' })
      const prevButton = screen.getByRole('button', { name: 'Previous page' })

      expect(nextButton).not.toBeDisabled()
      expect(prevButton).not.toBeDisabled()
    })

    it('hides pagination when no cursors are available', () => {
      vi.mocked(workflowClient.useQuery).mockReturnValue({
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

      render(<Automations />, { wrapper })

      expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument()
    })

    it('handles navigation back to first page correctly', () => {
      // Simulate being on last page with only prev cursor available (no next)
      vi.mocked(workflowClient.useQuery).mockReturnValue({
        data: {
          resources: mockWorkflows,
          next: null,
          prev: 'cursor-page1',
          total: 4,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Automations />, { wrapper })

      const prevButton = screen.getByRole('button', { name: 'Previous page' })
      const nextButton = screen.queryByRole('button', { name: 'Next page' })

      // Previous should be enabled, Next should be disabled
      expect(prevButton).not.toBeDisabled()
      expect(nextButton).toBeDisabled()

      // Clicking previous should work without errors
      expect(() => fireEvent.click(prevButton)).not.toThrow()
    })
  })

  describe('Delete Automation', () => {
    it('shows delete option in row actions menu', async () => {
      render(<Automations />, { wrapper })

      // Wait for table to render
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Open the actions menu
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Verify delete option exists
      await waitFor(() => {
        expect(screen.getByText('Delete automation')).toBeInTheDocument()
      })
    })

    it('opens delete confirmation modal when delete is clicked', async () => {
      render(<Automations />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Open actions menu
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      // Click delete
      const deleteItem = await screen.findByText('Delete automation')
      fireEvent.click(deleteItem)

      // Verify modal is shown
      await waitFor(() => {
        expect(screen.getByText('Delete automation?')).toBeInTheDocument()
        expect(screen.getByText(/You are about to permanently delete this automation/)).toBeInTheDocument()
        expect(screen.getByText(/This automation will stop running immediately/)).toBeInTheDocument()
      })
    })

    it('deletes automation successfully and shows success alert', async () => {
      const mockRefetch = vi.fn()
      const mockDeleteMutate = vi.fn((params, callbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess(undefined, params, undefined)
        }
      })

      vi.mocked(workflowClient.useQuery).mockReturnValue({
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

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'delete') {
          return {
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
          }
        }
        return {
          mutate: vi.fn(),
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
        }
      })

      render(<Automations />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Open actions menu and click delete
      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      const deleteItem = await screen.findByText('Delete automation')
      fireEvent.click(deleteItem)

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getByText('Delete automation?')).toBeInTheDocument()
      })

      const deleteButton = screen.getByRole('button', { name: 'Delete' })
      fireEvent.click(deleteButton)

      // Verify success
      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalled()
        expect(mockRefetch).toHaveBeenCalled()
        expect(screen.getByText('Automation Deleted')).toBeInTheDocument()
        expect(screen.getByText(/Successfully deleted automation/)).toBeInTheDocument()
      })
    })

    it('handles delete error and shows error alert', async () => {
      const mockError = { message: 'Delete failed' }
      const mockDeleteMutate = vi.fn((params, callbacks) => {
        if (callbacks?.onError) {
          callbacks.onError(mockError, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'delete') {
          return {
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
          }
        }
        return {
          mutate: vi.fn(),
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
        }
      })

      render(<Automations />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Open actions menu and click delete
      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      const deleteItem = await screen.findByText('Delete automation')
      fireEvent.click(deleteItem)

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getByText('Delete automation?')).toBeInTheDocument()
      })

      const deleteButton = screen.getByRole('button', { name: 'Delete' })
      fireEvent.click(deleteButton)

      // Verify error alert
      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalled()
        expect(screen.getByText('Delete Failed')).toBeInTheDocument()
        expect(screen.getByText(/Failed to delete automation/)).toBeInTheDocument()
      })
    })

    it('can cancel delete operation', async () => {
      render(<Automations />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Open actions menu and click delete
      const table = screen.getByRole('grid', { name: 'Automations table' })
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]
      const buttons = within(firstDataRow).getAllByRole('button')
      const menuTrigger = buttons[buttons.length - 1]
      fireEvent.click(menuTrigger)

      const deleteItem = await screen.findByText('Delete automation')
      fireEvent.click(deleteItem)

      // Modal appears
      await waitFor(() => {
        expect(screen.getByText('Delete automation?')).toBeInTheDocument()
      })

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      // Modal closes
      await waitFor(() => {
        expect(screen.queryByText('Delete automation?')).not.toBeInTheDocument()
      })
    })
  })

  describe('Sorting Functionality', () => {
    it('renders sortable column headers', async () => {
      render(<Automations />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Verify sortable columns have sort buttons
      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      expect(within(nameHeader).getByRole('button')).toBeInTheDocument()

      const createdAtHeader = screen.getByRole('columnheader', { name: /Created at/i })
      expect(within(createdAtHeader).getByRole('button')).toBeInTheDocument()

      const updatedAtHeader = screen.getByRole('columnheader', { name: /Updated at/i })
      expect(within(updatedAtHeader).getByRole('button')).toBeInTheDocument()
    })

    it('changes sort when clicking column headers', async () => {
      render(<Automations />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Click Name header to sort by name
      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      const sortButton = within(nameHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All automations should still be visible
      expect(screen.getByText('Important Project Workflow')).toBeInTheDocument()
      expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
    })

    it('can toggle sort direction by clicking the same column header', async () => {
      render(<Automations />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      const sortButton = within(nameHeader).getByRole('button')

      // Click twice to toggle direction
      fireEvent.click(sortButton)
      fireEvent.click(sortButton)

      // All automations should still be visible after sorting
      expect(screen.getByText('Important Project Workflow')).toBeInTheDocument()
      expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
    })

    it('can sort by different columns', async () => {
      render(<Automations />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // Click Created at column
      const createdAtHeader = screen.getByRole('columnheader', { name: /Created at/i })
      const sortButton = within(createdAtHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All automations should still be visible
      expect(screen.getByText('Important Project Workflow')).toBeInTheDocument()
      expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
    })
  })
})
