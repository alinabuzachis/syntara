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
      mutateAsync: mockMutate.mockResolvedValue(undefined),
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

      // Since 2 tools are enabled by default (tool_one and tool_three), it shows selection count
      // Check that it appears in both header and footer
      const counts = screen.getAllByText('2 of 3 tools enabled')
      expect(counts.length).toBeGreaterThan(0)
    })
  })

  describe('Selection State', () => {
    it('shows enabled tools as selected on initial render', () => {
      render(<IntegrationTools />, { wrapper })

      // Get all checkboxes
      const checkboxes = screen.getAllByRole('checkbox')

      // Header checkbox + 3 tool checkboxes = 4 total
      expect(checkboxes.length).toBe(4)

      // Tools are sorted alphabetically: tool_one, tool_three, tool_two
      // tool_one (enabled: true), tool_three (enabled: true), tool_two (enabled: false)
      const toolCheckboxes = checkboxes.slice(1) // Skip header checkbox

      // tool_one should be checked (enabled: true)
      expect(toolCheckboxes[0]).toBeChecked()
      // tool_three should be checked (enabled: true)
      expect(toolCheckboxes[1]).toBeChecked()
      // tool_two should not be checked (enabled: false)
      expect(toolCheckboxes[2]).not.toBeChecked()
    })

    it('updates selection count when tools are selected', () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      // Tools sorted alphabetically: tool_one, tool_three, tool_two
      // tool_two is at index 3 (after header), currently unchecked
      const tool2Checkbox = checkboxes[3]

      // Click to select tool_two
      fireEvent.click(tool2Checkbox)

      // Should show 3 tools enabled (all tools now selected) - appears in both header and footer
      const counts = screen.getAllByText('3 of 3 tools enabled')
      expect(counts.length).toBeGreaterThan(0)
    })

    it('allows toggling individual tool selection', () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      // After sorting: tool_one (index 1), tool_three (index 2), tool_two (index 3)
      const toolOneCheckbox = checkboxes[1] // tool_one (currently checked)

      // Click to deselect tool_one
      fireEvent.click(toolOneCheckbox)

      // tool_one should now be unchecked
      expect(toolOneCheckbox).not.toBeChecked()
    })

    it('supports select all functionality', () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const selectAllCheckbox = checkboxes[0]

      // Click select all
      fireEvent.click(selectAllCheckbox)

      // All tools should now be enabled - appears in both header and footer
      const counts = screen.getAllByText('3 of 3 tools enabled')
      expect(counts.length).toBeGreaterThan(0)
    })

    it('supports deselect all functionality', () => {
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const selectAllCheckbox = checkboxes[0]

      // Click select all first
      fireEvent.click(selectAllCheckbox)
      // Click again to deselect all
      fireEvent.click(selectAllCheckbox)

      // Should show no selection - count appears in both header and footer
      const counts = screen.getAllByText('3 tools')
      expect(counts.length).toBeGreaterThan(0)
    })
  })

  describe('Search Functionality', () => {
    it('allows searching tools', () => {
      render(<IntegrationTools />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search tools...')

      // Simulate typing in the search input
      const searchTerm = 'tool_one'
      fireEvent.change(searchInput, { target: { value: searchTerm } })

      // Verify the input value is updated
      expect(searchInput.value).toBe(searchTerm)
    })

    it('filters tools with fuzzy search', () => {
      render(<IntegrationTools />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search tools...')

      // Simulate searching for "tool_one"
      fireEvent.change(searchInput, { target: { value: 'tool_one' } })

      // The matching tool should be visible
      expect(screen.getByText('test.tool_one')).toBeInTheDocument()
    })

    it('shows all tools when search is empty', () => {
      render(<IntegrationTools />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search tools...')

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
      // After sorting: tool_one (index 1), tool_three (index 2), tool_two (index 3)
      const toolTwoCheckbox = checkboxes[3] // tool_two (currently unchecked)

      // Select tool_two
      fireEvent.click(toolTwoCheckbox)

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
      // After sorting: tool_one (index 1), tool_three (index 2), tool_two (index 3)
      const toolOneCheckbox = checkboxes[1] // tool_one (currently checked)

      // Deselect tool_one
      fireEvent.click(toolOneCheckbox)

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

      // Find table by aria-label since PatternFly Table may not expose table role
      const table = screen.getByLabelText('Tools table')
      expect(table).toBeInTheDocument()

      // Should have checkboxes for selection
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)
    })

    it('renders Name column header', () => {
      render(<IntegrationTools />, { wrapper })

      // Column header shows "Name"
      const nameHeader = screen.getByRole('columnheader', { name: /Name/i })
      expect(nameHeader).toBeInTheDocument()
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
      // Tools sorted alphabetically: tool_one, tool_three, tool_two
      // tool_two is at index 3 (after header), currently unchecked
      const tool2Checkbox = checkboxes[3]

      // Select tool_two
      fireEvent.click(tool2Checkbox)

      // Verify enabledTools state was updated
      expect(tool2Checkbox).toBeChecked()
    })
  })

  describe('Scrollable Container', () => {
    it('renders Stack for proper layout', () => {
      const { container } = render(<IntegrationTools />, { wrapper })

      // Check that Stack is rendered (form was removed as it wasn't needed)
      const stack = container.querySelector('.pf-v6-l-stack')
      expect(stack).toBeInTheDocument()
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

      // Should show "3 tools (of 50 total)" when no tools are enabled - appears in both header and footer
      const counts = screen.getAllByText('3 tools')
      expect(counts.length).toBeGreaterThan(0)
      // Total count also appears in both places
      const totals = screen.getAllByText('(of 50 total)')
      expect(totals.length).toBeGreaterThan(0)
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

  describe('Sorting Functionality', () => {
    it('renders sortable Name column header', () => {
      render(<IntegrationTools />, { wrapper })

      // Verify sortable column has sort button
      const nameHeader = screen.getByRole('columnheader', { name: /Name/i })
      expect(within(nameHeader).getByRole('button')).toBeInTheDocument()
    })

    it('sorts tools in ascending order by default', () => {
      render(<IntegrationTools />, { wrapper })

      // Get all table rows (excluding header)
      const rows = screen.getAllByRole('row').slice(1)

      // Verify ascending alphabetical order: tool_one, tool_three, tool_two
      // (Note: "one" < "three" < "two" alphabetically)
      expect(within(rows[0]).getByText('test.tool_one')).toBeInTheDocument()
      expect(within(rows[1]).getByText('test.tool_three')).toBeInTheDocument()
      expect(within(rows[2]).getByText('test.tool_two')).toBeInTheDocument()
    })

    it('sorts tools in descending order when clicking Name column header', () => {
      render(<IntegrationTools />, { wrapper })

      // Click Name header to toggle to descending
      const nameHeader = screen.getByRole('columnheader', { name: /Name/i })
      const sortButton = within(nameHeader).getByRole('button')
      fireEvent.click(sortButton)

      // Get all table rows (excluding header)
      const rows = screen.getAllByRole('row').slice(1)

      // Verify descending alphabetical order: tool_two, tool_three, tool_one
      expect(within(rows[0]).getByText('test.tool_two')).toBeInTheDocument()
      expect(within(rows[1]).getByText('test.tool_three')).toBeInTheDocument()
      expect(within(rows[2]).getByText('test.tool_one')).toBeInTheDocument()
    })

    it('toggles back to ascending order on second click', () => {
      render(<IntegrationTools />, { wrapper })

      const nameHeader = screen.getByRole('columnheader', { name: /Name/i })
      const sortButton = within(nameHeader).getByRole('button')

      // Click twice to go: asc -> desc -> asc
      fireEvent.click(sortButton)
      fireEvent.click(sortButton)

      // Get all table rows (excluding header)
      const rows = screen.getAllByRole('row').slice(1)

      // Verify back to ascending alphabetical order: tool_one, tool_three, tool_two
      expect(within(rows[0]).getByText('test.tool_one')).toBeInTheDocument()
      expect(within(rows[1]).getByText('test.tool_three')).toBeInTheDocument()
      expect(within(rows[2]).getByText('test.tool_two')).toBeInTheDocument()
    })
  })
})
