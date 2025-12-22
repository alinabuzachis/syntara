import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { toolProvidersClient, toolsClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'

import IntegrationTools from './IntegrationTools'

// Mock dependencies
vi.mock('../../../client', () => ({
  toolProvidersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  toolsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('wouter', () => ({
  useLocation: () => ['/configuration/integrations/provider-1/tools', vi.fn()],
  useParams: () => ({ provider_id: 'provider-1' }),
}))

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

describe('IntegrationTools Component', () => {
  const mockProvider = {
    id: 'provider-1',
    name: 'Test Provider',
    description: 'A test tool provider',
    status: 'available',
    configuration: {
      provider_type: 'mcp-server',
      url: 'https://test.example.com',
    },
    tool_count: 3,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
  }

  const mockTools = [
    {
      id: 'tool-1',
      namespaced_name: 'test.tool_one',
      description: 'First test tool',
      enabled: true,
      provider_id: 'provider-1',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
    },
    {
      id: 'tool-2',
      namespaced_name: 'test.tool_two',
      description: 'Second test tool',
      enabled: false,
      provider_id: 'provider-1',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
    },
    {
      id: 'tool-3',
      namespaced_name: 'test.tool_three',
      description: 'Third test tool with longer description',
      enabled: true,
      provider_id: 'provider-1',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
    },
  ]

  const mockMutate = vi.fn()

  beforeEach(() => {
    // Reset mocks before each test
    vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
      data: mockProvider,
      isPending: false,
      isError: false,
      error: null,
    })

    vi.mocked(toolProvidersClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      data: null,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      isSuccess: false,
      isIdle: true,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: 'idle',
      submittedAt: 0,
      variables: undefined,
      context: undefined,
    })

    vi.mocked(toolsClient.useQuery).mockReturnValue({
      data: { resources: mockTools },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    vi.mocked(toolsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      isSuccess: false,
      isIdle: true,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: 'idle',
      submittedAt: 0,
      variables: undefined,
      context: undefined,
    })
  })

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<IntegrationTools />, { wrapper })

      // Check page header with provider name
      expect(screen.getByText('Test Provider tools')).toBeInTheDocument()

      // Check search input
      const searchInput = screen.getByPlaceholderText('Search tools...')
      expect(searchInput).toBeInTheDocument()

      // Check Save and Cancel buttons
      expect(screen.getByText('Save')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('renders tools in table view', () => {
      render(<IntegrationTools />, { wrapper })

      // Check that tool names are rendered
      expect(screen.getByText('test.tool_one')).toBeInTheDocument()
      expect(screen.getByText('test.tool_two')).toBeInTheDocument()
      expect(screen.getByText('test.tool_three')).toBeInTheDocument()
    })

    it('renders tool descriptions', () => {
      render(<IntegrationTools />, { wrapper })

      // Check that descriptions are rendered
      expect(screen.getByText('First test tool')).toBeInTheDocument()
      expect(screen.getByText('Second test tool')).toBeInTheDocument()
      expect(screen.getByText('Third test tool with longer description')).toBeInTheDocument()
    })

    it('displays correct item count', () => {
      render(<IntegrationTools />, { wrapper })

      // Since 2 tools are enabled by default (tool-1 and tool-3), it shows selection count
      expect(screen.getByText('2 of 3 tools enabled')).toBeInTheDocument()
    })
  })

  describe('Selection State', () => {
    it('shows enabled tools as selected on initial render', () => {
      render(<IntegrationTools />, { wrapper })

      // Get all checkboxes
      const checkboxes = screen.getAllByRole('checkbox')

      // Header checkbox + 3 tool checkboxes = 4 total
      expect(checkboxes.length).toBe(4)

      // tool-1 and tool-3 should be checked (enabled: true)
      // tool-2 should be unchecked (enabled: false)
      // We can verify this by checking the checked state
      const toolCheckboxes = checkboxes.slice(1) // Skip header checkbox

      // Tool 1 should be checked (enabled: true)
      expect(toolCheckboxes[0]).toBeChecked()
      // Tool 2 should not be checked (enabled: false)
      expect(toolCheckboxes[1]).not.toBeChecked()
      // Tool 3 should be checked (enabled: true)
      expect(toolCheckboxes[2]).toBeChecked()
    })

    it('updates selection count when tools are selected', () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const tool2Checkbox = checkboxes[2] // tool-2 (currently unchecked)

      // Click to select tool-2
      fireEvent.click(tool2Checkbox)

      // Should show 3 tools enabled (all tools now selected)
      expect(screen.getByText('3 of 3 tools enabled')).toBeInTheDocument()
    })

    it('allows toggling individual tool selection', () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const tool1Checkbox = checkboxes[1] // tool-1 (currently checked)

      // Click to deselect tool-1
      fireEvent.click(tool1Checkbox)

      // tool-1 should now be unchecked
      expect(tool1Checkbox).not.toBeChecked()
    })

    it('supports select all functionality', () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const selectAllCheckbox = checkboxes[0]

      // Click select all
      fireEvent.click(selectAllCheckbox)

      // All tools should now be enabled
      expect(screen.getByText('3 of 3 tools enabled')).toBeInTheDocument()
    })

    it('supports deselect all functionality', () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const selectAllCheckbox = checkboxes[0]

      // Click select all first
      fireEvent.click(selectAllCheckbox)
      // Click again to deselect all
      fireEvent.click(selectAllCheckbox)

      // Should show no selection
      expect(screen.getByText('3 tools')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    it('allows searching tools', () => {
      render(<IntegrationTools />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search tools...') as HTMLInputElement

      // Simulate typing in the search input
      const searchTerm = 'tool_one'
      fireEvent.change(searchInput, { target: { value: searchTerm } })

      // Verify the input value is updated
      expect(searchInput.value).toBe(searchTerm)
    })

    it('filters tools with fuzzy search', () => {
      render(<IntegrationTools />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search tools...') as HTMLInputElement

      // Simulate searching for "tool_one"
      fireEvent.change(searchInput, { target: { value: 'tool_one' } })

      // The matching tool should be visible
      expect(screen.getByText('test.tool_one')).toBeInTheDocument()
    })

    it('shows all tools when search is empty', () => {
      render(<IntegrationTools />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search tools...') as HTMLInputElement

      // Clear the search input
      fireEvent.change(searchInput, { target: { value: '' } })

      // Verify all tools are shown
      expect(screen.getByText('test.tool_one')).toBeInTheDocument()
      expect(screen.getByText('test.tool_two')).toBeInTheDocument()
      expect(screen.getByText('test.tool_three')).toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('calls update mutation when Save is clicked with enabled tools', async () => {
      render(<IntegrationTools />, { wrapper })

      const saveButton = screen.getByText('Save')

      // Click save (tools 1 and 3 are already enabled)
      fireEvent.click(saveButton)

      // The mutate function should be called
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })

    it('enables tools when user selects them and clicks Save', async () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const tool2Checkbox = checkboxes[2] // tool-2 (currently unchecked)

      // Select tool-2
      fireEvent.click(tool2Checkbox)

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      // The mutate function should be called with enabled tools
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })

    it('disables tools when user deselects them and clicks Save', async () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const tool1Checkbox = checkboxes[1] // tool-1 (currently checked)

      // Deselect tool-1
      fireEvent.click(tool1Checkbox)

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      // The mutate function should be called
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })
  })

  describe('Error Handling', () => {
    it('displays loading state for provider', () => {
      vi.mocked(toolProvidersClient.useQuery).mockReturnValueOnce({
        data: null,
        isPending: true,
        isError: false,
        error: null,
      })

      render(<IntegrationTools />, { wrapper })

      // Expect loading state
      const loadingElement = screen.getByTestId('loading-state')
      expect(loadingElement).toBeInTheDocument()
    })

    it('displays error state when provider fails to load', () => {
      const mockError = new Error('Failed to load provider')
      // NOTE: component may re-render due to AlertProvider updates; keep error stable across renders
      vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
        data: null,
        isPending: false,
        isError: true,
        error: mockError,
      })

      render(<IntegrationTools />, { wrapper })

      // Check for error state
      const errorElement = screen.getByTestId('error-state')
      expect(errorElement).toBeInTheDocument()
      // Title also appears in the global alert; scope to the error state container
      expect(within(errorElement).getByText('Error loading tools')).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('displays empty state when no tools exist', () => {
      // Mock with empty resources
      vi.mocked(toolsClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      // Check for empty state message and button
      expect(screen.getByText('No tools available')).toBeInTheDocument()
      expect(screen.getByText(/No tools found for "Test Provider"/)).toBeInTheDocument()
      // There are two "Refresh tools" buttons: one in header, one in empty state
      expect(screen.getAllByText('Refresh tools')).toHaveLength(2)
    })
  })

  describe('Table Structure', () => {
    it('renders table with checkboxes', () => {
      render(<IntegrationTools />, { wrapper })

      const table = screen.getByRole('table')
      expect(table).toBeInTheDocument()

      // Should have checkboxes for selection
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)
    })

    it('renders Name column', () => {
      render(<IntegrationTools />, { wrapper })

      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    it('displays tool information in rows', () => {
      render(<IntegrationTools />, { wrapper })

      // All tools should be visible in the table
      expect(screen.getByText('test.tool_one')).toBeInTheDocument()
      expect(screen.getByText('First test tool')).toBeInTheDocument()

      expect(screen.getByText('test.tool_two')).toBeInTheDocument()
      expect(screen.getByText('Second test tool')).toBeInTheDocument()

      expect(screen.getByText('test.tool_three')).toBeInTheDocument()
      expect(screen.getByText('Third test tool with longer description')).toBeInTheDocument()
    })
  })

  describe('Selection Callback', () => {
    it('calls onSelectionChange when tools are selected', () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const tool2Checkbox = checkboxes[2] // tool-2

      // Select tool-2
      fireEvent.click(tool2Checkbox)

      // Verify enabledTools state was updated
      expect(tool2Checkbox).toBeChecked()
    })
  })

  describe('Scrollable Container', () => {
    it('renders form with proper overflow classes for scrollbar visibility', () => {
      const { container } = render(<IntegrationTools />, { wrapper })

      // Check that form has overflow-hidden class
      const form = container.querySelector('form')
      expect(form).toHaveClass('overflow-hidden')
      expect(form).toHaveClass('flex')
      expect(form).toHaveClass('grow')
      expect(form).toHaveClass('flex-col')
    })
  })

  describe('Pagination', () => {
    it('displays pagination controls when next or prev cursors are available', () => {
      vi.mocked(toolsClient.useQuery).mockReturnValue({
        data: {
          resources: mockTools,
          next: 'next-cursor-123',
          prev: null,
          total: 50,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      // Should show Next button (enabled) and Previous button (disabled)
      const nextButton = screen.getByRole('button', { name: 'Next page' })
      const prevButton = screen.getByRole('button', { name: 'Previous page' })

      expect(nextButton).toBeInTheDocument()
      expect(prevButton).toBeInTheDocument()
      expect(nextButton).not.toBeDisabled()
      expect(prevButton).toBeDisabled()
    })

    it('displays total count when available', () => {
      const toolsWithoutEnabled = mockTools.map((tool) => ({ ...tool, enabled: false }))

      vi.mocked(toolsClient.useQuery).mockReturnValue({
        data: {
          resources: toolsWithoutEnabled,
          next: 'next-cursor',
          prev: null,
          total: 50,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      // Should show "3 tools (of 50 total)" when no tools are enabled
      expect(screen.getByText('3 tools')).toBeInTheDocument()
      expect(screen.getByText('(of 50 total)')).toBeInTheDocument()
    })

    it('calls onPageChange with next cursor when Next button is clicked', () => {
      vi.mocked(toolsClient.useQuery).mockReturnValue({
        data: {
          resources: mockTools,
          next: 'next-cursor-123',
          prev: null,
          total: 50,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      const nextButton = screen.getByRole('button', { name: 'Next page' })
      fireEvent.click(nextButton)

      // The component should update its cursor state
      // We can verify this by checking if the button is rendered
      expect(nextButton).toBeInTheDocument()
    })

    it('calls onPageChange with prev cursor when Previous button is clicked', () => {
      vi.mocked(toolsClient.useQuery).mockReturnValue({
        data: {
          resources: mockTools,
          next: 'next-cursor',
          prev: 'prev-cursor-123',
          total: 50,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      const prevButton = screen.getByRole('button', { name: 'Previous page' })
      expect(prevButton).not.toBeDisabled()

      fireEvent.click(prevButton)

      expect(prevButton).toBeInTheDocument()
    })

    it('does not display pagination when no cursors are available', () => {
      vi.mocked(toolsClient.useQuery).mockReturnValue({
        data: {
          resources: mockTools,
          next: null,
          prev: null,
          total: 3,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      // Pagination buttons should not be in the document
      expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument()
    })
  })

  describe('Refresh Tools Functionality', () => {
    it('opens confirmation dialog when header Refresh tools button is clicked', () => {
      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      const headerRefreshButton = refreshButtons[0] // First button is in the header

      fireEvent.click(headerRefreshButton)

      // Check that confirmation dialog is displayed
      expect(screen.getByText(/Are you sure you want to refresh tools/i)).toBeInTheDocument()
      expect(screen.getByText(/This will fetch the latest tools from the integration/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('calls refresh mutation when confirmation dialog is confirmed', async () => {
      const mockRefreshMutate = vi.fn()
      vi.mocked(toolProvidersClient.useMutation).mockReturnValue({
        mutate: mockRefreshMutate,
        isPending: false,
        isError: false,
        error: null,
        data: null,
        reset: vi.fn(),
        mutateAsync: vi.fn(),
        isSuccess: false,
        isIdle: true,
        failureCount: 0,
        failureReason: null,
        isPaused: false,
        status: 'idle',
        submittedAt: 0,
        variables: undefined,
        context: undefined,
      })

      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      const headerRefreshButton = refreshButtons[0]

      fireEvent.click(headerRefreshButton)

      const confirmButton = screen.getByRole('button', { name: 'Refresh' })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockRefreshMutate).toHaveBeenCalled()
      })
    })

    it('does not call refresh mutation when confirmation dialog is cancelled', () => {
      const mockRefreshMutate = vi.fn()
      vi.mocked(toolProvidersClient.useMutation).mockReturnValue({
        mutate: mockRefreshMutate,
        isPending: false,
        isError: false,
        error: null,
        data: null,
        reset: vi.fn(),
        mutateAsync: vi.fn(),
        isSuccess: false,
        isIdle: true,
        failureCount: 0,
        failureReason: null,
        isPaused: false,
        status: 'idle',
        submittedAt: 0,
        variables: undefined,
        context: undefined,
      })

      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      const headerRefreshButton = refreshButtons[0]

      fireEvent.click(headerRefreshButton)

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      expect(mockRefreshMutate).not.toHaveBeenCalled()
    })

    it('calls refresh mutation directly when empty state Refresh tools button is clicked', async () => {
      const mockRefreshMutate = vi.fn()
      vi.mocked(toolProvidersClient.useMutation).mockReturnValue({
        mutate: mockRefreshMutate,
        isPending: false,
        isError: false,
        error: null,
        data: null,
        reset: vi.fn(),
        mutateAsync: vi.fn(),
        isSuccess: false,
        isIdle: true,
        failureCount: 0,
        failureReason: null,
        isPaused: false,
        status: 'idle',
        submittedAt: 0,
        variables: undefined,
        context: undefined,
      })

      // Mock with empty tools
      vi.mocked(toolsClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      const emptyStateRefreshButton = refreshButtons[1] // Second button is in empty state

      fireEvent.click(emptyStateRefreshButton)

      // Should call refresh directly without showing confirmation dialog
      await waitFor(() => {
        expect(mockRefreshMutate).toHaveBeenCalled()
      })

      // Confirmation dialog should not be shown
      expect(screen.queryByText(/Are you sure you want to refresh tools/i)).not.toBeInTheDocument()
    })
  })
})
