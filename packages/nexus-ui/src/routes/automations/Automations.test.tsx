import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import Automations from './Automations'
import { workflowClient } from '../../client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AlertProvider } from '@ansible/nexus-ui-framework'

// Mock dependencies
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

const mockSetLocation = vi.fn()

vi.mock('wouter', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
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
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-02T00:00:00Z',
      labels: {
        type: 'critical',
        status: 'active',
      },
    },
    {
      id: '2',
      name: 'Secondary Team Workflow',
      description: 'Routine workflow for secondary tasks',
      createdAt: '2023-02-01T00:00:00Z',
      updatedAt: '2023-02-02T00:00:00Z',
      labels: {
        type: 'routine',
        status: 'maintenance',
      },
    },
  ]

  beforeEach(() => {
    // Reset mocks before each test
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: { resources: mockWorkflows },
      isPending: false,
      isError: false,
      error: null,
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
      const searchInput = screen.getByPlaceholderText('Search integrations...')
      expect(searchInput).toBeInTheDocument()
    })

    it('renders workflows in the table', () => {
      render(<Automations />, { wrapper })

      // Check workflow names are rendered
      expect(screen.getByText('Important Project Workflow')).toBeInTheDocument()
      expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    it('allows searching workflows', () => {
      render(<Automations />, { wrapper })

      // Find the search input
      const searchInput = screen.getByPlaceholderText('Search integrations...') as HTMLInputElement

      // Simulate typing in the search input
      const searchTerm = 'project'
      fireEvent.change(searchInput, { target: { value: searchTerm } })

      // Verify the input value is updated
      expect(searchInput.value).toBe(searchTerm)
    })

    it('filters workflows with fuzzy search, prioritizing most relevant', () => {
      render(<Automations />, { wrapper })

      // Find the search input
      const searchInput = screen.getByPlaceholderText('Search integrations...') as HTMLInputElement

      // Simulate searching for "project"
      fireEvent.change(searchInput, { target: { value: 'project' } })

      // Get all table rows
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')

      // Verify row count (header + at least 1 data row)
      expect(rows.length).toBeGreaterThanOrEqual(2)

      // The most relevant row (containing "project") should be the first data row
      const firstDataRow = rows[1]
      expect(within(firstDataRow).getByText('Important Project Workflow')).toBeInTheDocument()

      // Verify the other workflow is not visible
      expect(screen.queryByText('Secondary Team Workflow')).not.toBeInTheDocument()
    })

    it('supports partial matches in fuzzy search', () => {
      render(<Automations />, { wrapper })

      // Find the search input
      const searchInput = screen.getByPlaceholderText('Search integrations...') as HTMLInputElement

      // Simulate searching for "team"
      fireEvent.change(searchInput, { target: { value: 'team' } })

      // Get all table rows
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')

      // Verify row count (header + at least 1 data row)
      expect(rows.length).toBeGreaterThanOrEqual(2)

      // The row with "team" should be visible
      expect(screen.getByText('Secondary Team Workflow')).toBeInTheDocument()
    })

    it('shows all workflows when search is empty', () => {
      render(<Automations />, { wrapper })

      // Find the search input
      const searchInput = screen.getByPlaceholderText('Search integrations...') as HTMLInputElement

      // Clear the search input
      fireEvent.change(searchInput, { target: { value: '' } })

      // Get all table rows
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')

      // Verify all rows are shown (header + 2 data rows)
      expect(rows.length).toBeGreaterThanOrEqual(3)
      expect(within(rows[1]).getByText('Important Project Workflow')).toBeInTheDocument()
      expect(within(rows[2]).getByText('Secondary Team Workflow')).toBeInTheDocument()
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
      vi.mocked(workflowClient.useQuery).mockReturnValueOnce({
        data: null,
        isPending: false,
        isError: true,
        error: mockError,
      })

      render(<Automations />, { wrapper })

      // Check for error state
      const errorElement = screen.getByTestId('error-state')
      expect(errorElement).toBeInTheDocument()
      expect(screen.getByText('Error loading workflows')).toBeInTheDocument()
    })
  })

  describe('Table Columns', () => {
    it('renders name column with links', () => {
      render(<Automations />, { wrapper })

      const workflow1Link = screen.getByText('Important Project Workflow')
      expect(workflow1Link).toBeInTheDocument()
      expect(workflow1Link.closest('a')).toHaveAttribute('href', '/automations/1')
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

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button (the ... button)
      const menuTrigger = within(firstDataRow).getByRole('button')
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

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button
      const menuTrigger = within(firstDataRow).getByRole('button')
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

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button
      const menuTrigger = within(firstDataRow).getByRole('button')
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
          screen.getByText(/Failed to start automation "Important Project Workflow": Unknown error/)
        ).toBeInTheDocument()
      })
    })

    it('shows confirmation dialog when running automation', async () => {
      render(<Automations />, { wrapper })

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button
      const menuTrigger = within(firstDataRow).getByRole('button')
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

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button
      const menuTrigger = within(firstDataRow).getByRole('button')
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

      // Find and click the row action button for the first workflow
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')
      const firstDataRow = rows[1]

      // Find and click the menu trigger button
      const menuTrigger = within(firstDataRow).getByRole('button')
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
})
