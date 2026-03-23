import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { executionsClient, workflowClient } from '../../client'
import { AlertProvider } from '../../components/alerts'
import { assertUrlParam, assertUrlParamIsNull } from '../../test/filter-test-helpers'

import Automations from './Automations'

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
}))

const mockSetLocation = vi.fn()
const mockSetSearchParams = vi.fn()

vi.mock('wouter', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useLocation: () => ['/automations', mockSetLocation],
    useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
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

    // Mock executionsClient.useMutation for execute automation
    vi.mocked(executionsClient.useMutation).mockReturnValue({
      ...defaultMutationReturn,
      mutate: vi.fn((body, callbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({}, body, undefined)
        }
      }),
    })

    // Mock workflowClient.useMutation for delete automation
    vi.mocked(workflowClient.useMutation).mockReturnValue({
      ...defaultMutationReturn,
      mutate: vi.fn(),
    })
  })

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<Automations />, { wrapper })

      // Check page header
      expect(screen.getByText('Automations')).toBeInTheDocument()

      // Check table is rendered
      expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
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

  describe('Filter Functionality', () => {
    it('renders FilterBar component without keyword search', () => {
      render(<Automations />, { wrapper })

      // FilterBar should be present but keyword search input should not
      expect(screen.queryByPlaceholderText('Search automations...')).not.toBeInTheDocument()

      // Table should still render
      expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
    })

    it('shows all workflows when no filters are active', async () => {
      render(<Automations />, { wrapper })

      // Wait for table to render
      await waitFor(() => {
        expect(screen.getByRole('grid', { name: 'Automations table' })).toBeInTheDocument()
      })

      // All workflows should be visible
      expect(screen.getByText('Important Project Workflow')).toBeInTheDocument()
      expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
    })

    it('applies name filter to API query when typing and submitting', async () => {
      const user = userEvent.setup()
      render(<Automations />, { wrapper })

      const nameInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(nameInput, 'deploy')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        assertUrlParam(mockSetSearchParams, 'name[contains]', 'deploy')
      })
    })

    it('applies state filter (is_enabled) to API query when selecting option', async () => {
      const user = userEvent.setup()
      render(<Automations />, { wrapper })

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
    })

    it('resets pagination cursor when filters change', async () => {
      const user = userEvent.setup()

      // Start with pagination cursor in URL
      vi.mocked(workflowClient.useQuery).mockReturnValue({
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

      render(<Automations />, { wrapper })

      // Apply a filter
      const nameInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(nameInput, 'test')
      await user.keyboard('{Enter}')

      // Verify cursor was reset
      await waitFor(() => {
        assertUrlParamIsNull(mockSetSearchParams, 'cursor')
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

    it('renders tags column with label keys from workflow.labels', () => {
      render(<Automations />, { wrapper })

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
      vi.mocked(workflowClient.useQuery).mockReturnValue({
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

      render(<Automations />, { wrapper })

      expect(screen.getByText('deploy')).toBeInTheDocument()
      expect(screen.getByText('prod')).toBeInTheDocument()
    })
  })

  describe('Execute Automation Row Action', () => {
    it('shows success alert when automation executes successfully', async () => {
      const mockMutate = vi.fn((body, callbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({}, body, undefined)
        }
      })

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

  // NOTE: Sorting tests removed - client-side sorting disabled for cursor-paginated data
})
