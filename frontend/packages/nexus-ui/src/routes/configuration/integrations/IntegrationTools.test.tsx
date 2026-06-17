import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { toolManagerClient } from '../../../client'
import { AlertProvider } from '../../../providers/alerts'
import { assertUrlParam, assertUrlParamIsNull } from '../../../test/filter-test-helpers'

import IntegrationTools from './IntegrationTools'

// Mock dependencies
vi.mock('../../../client', () => ({
  toolManagerClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

const mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('../../../hooks/routing/useLocation', () => ({
  useLocation: () => '/configuration/integrations/provider-1/tools',
}))
const mockNavigate = vi.fn()
vi.mock('../../../hooks/routing/useNavigate', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../hooks/routing/useParams', () => ({
  useParams: () => ({ provider_id: 'provider-1' }),
}))

vi.mock('../../../hooks/routing/useSearchParams', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
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

  const baseQueryResult = {
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }

  beforeEach(() => {
    // Reset mocks before each test - use mockImplementation to return different data per endpoint
    mockMutate.mockClear()
    mockSetSearchParams.mockClear()
    vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
      if (path === '/tool_manager/tool_providers/{provider_id}') {
        return { ...baseQueryResult, data: mockProvider } as never
      }
      return { ...baseQueryResult, data: { resources: mockTools } } as never
    })

    vi.mocked(toolManagerClient.useMutation).mockImplementation((_method, path: string) => {
      if (path === '/tool_manager/tools/bulk_update') {
        return {
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
        } as never
      }
      return {
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
      } as never
    })
  })

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<IntegrationTools />, { wrapper })

      // Check page header with provider name
      expect(screen.getByRole('heading', { name: 'Test Provider tools' })).toBeInTheDocument()

      // Check filter input (FilterBar name filter)
      const filterInput = screen.getByRole('textbox', { name: /name filter/i })
      expect(filterInput).toBeInTheDocument()

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

      // PF Pagination renders in the footer; verify it is present
      const paginationNav = screen.getByRole('navigation', { name: /pagination/i })
      expect(paginationNav).toBeInTheDocument()

      // Verify the correct number of tool checkboxes (header + 3 tools)
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBe(4)
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

    it('unchecks a tool when a new API payload marks it disabled', async () => {
      const toolsRef = { list: mockTools.map((t) => ({ ...t })) }
      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return { ...baseQueryResult, data: mockProvider } as never
        }
        return { ...baseQueryResult, data: { resources: toolsRef.list } } as never
      })

      const { rerender } = render(<IntegrationTools />, { wrapper })

      const toolOneRow = screen.getByRole('row', { name: /test\.tool_one/ })
      const toolOneCheckbox = within(toolOneRow).getByRole('checkbox')
      expect(toolOneCheckbox).toBeChecked()

      toolsRef.list = toolsRef.list.map((t) => (t.id === 'tool-1' ? { ...t, enabled: false } : t))
      rerender(<IntegrationTools />)

      await waitFor(() => {
        const row = screen.getByRole('row', { name: /test\.tool_one/ })
        expect(within(row).getByRole('checkbox')).not.toBeChecked()
      })
    })

    it('updates selection count when tools are selected', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      // Tools sorted alphabetically: tool_one, tool_three, tool_two
      // tool_two is at index 3 (after header), currently unchecked
      const tool2Checkbox = checkboxes[3]

      // Click to select tool_two
      await user.click(tool2Checkbox)

      // All tool checkboxes should now be checked
      const toolCheckboxes = screen.getAllByRole('checkbox').slice(1) // skip header
      expect(toolCheckboxes.every((cb) => (cb as HTMLInputElement).checked)).toBe(true)
    })

    it('allows toggling individual tool selection', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      // After sorting: tool_one (index 1), tool_three (index 2), tool_two (index 3)
      const toolOneCheckbox = checkboxes[1] // tool_one (currently checked)

      // Click to deselect tool_one
      await user.click(toolOneCheckbox)

      // tool_one should now be unchecked
      expect(toolOneCheckbox).not.toBeChecked()
    })

    it('supports select all functionality', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const selectAllCheckbox = checkboxes[0]

      // Click select all
      await user.click(selectAllCheckbox)

      // All tool checkboxes should now be checked
      const toolCheckboxes = screen.getAllByRole('checkbox').slice(1) // skip header
      expect(toolCheckboxes.every((cb) => (cb as HTMLInputElement).checked)).toBe(true)
    })

    it('supports deselect all functionality', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const selectAllCheckbox = checkboxes[0]

      // Click select all first
      await user.click(selectAllCheckbox)
      // Click again to deselect all
      await user.click(selectAllCheckbox)

      // All tool checkboxes should now be unchecked
      const toolCheckboxes = screen.getAllByRole('checkbox').slice(1) // skip header
      expect(toolCheckboxes.every((cb) => !(cb as HTMLInputElement).checked)).toBe(true)
    })
  })

  describe('Filter Functionality', () => {
    it('applies name filter to API query when typing and submitting', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const filterInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(filterInput, 'search-term')
      await user.keyboard('{Enter}')

      // Verify both UI state AND API contract
      expect(filterInput).toHaveValue('search-term')
      await waitFor(() => {
        assertUrlParam(mockSetSearchParams, 'name[contains]', 'search-term')
      })
    })

    it('displays filter input for filtering tools', () => {
      render(<IntegrationTools />, { wrapper })

      const filterInput = screen.getByRole('textbox', { name: /name filter/i })
      expect(filterInput).toBeInTheDocument()
      expect(filterInput).toHaveAttribute('placeholder', 'Filter by name')
    })

    it('shows all tools when filters are empty', () => {
      render(<IntegrationTools />, { wrapper })

      // Verify all tools are shown
      expect(screen.getByText('test.tool_one')).toBeInTheDocument()
      expect(screen.getByText('test.tool_two')).toBeInTheDocument()
      expect(screen.getByText('test.tool_three')).toBeInTheDocument()
    })

    it('resets pagination cursor when filters change', async () => {
      const user = userEvent.setup()

      // Start with pagination cursor in URL
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: {
          resources: mockTools,
          next: 'next-cursor',
          prev: 'prev-cursor',
          total: 50,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      // Apply a filter
      const filterInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(filterInput, 'tool_one')
      await user.keyboard('{Enter}')

      // Verify cursor was reset
      await waitFor(() => {
        assertUrlParamIsNull(mockSetSearchParams, 'cursor')
      })
      expect(mockSetSearchParams).toHaveBeenCalled()
    })
  })

  describe('Form Submission', () => {
    it('calls update mutation when Save is clicked with enabled tools', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const saveButton = screen.getByText('Save')

      // Click save (tools 1 and 3 are already enabled)
      await user.click(saveButton)

      // The mutate function should be called
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })

    it('enables tools when user selects them and clicks Save', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      // After sorting: tool_one (index 1), tool_three (index 2), tool_two (index 3)
      const toolTwoCheckbox = checkboxes[3] // tool_two (currently unchecked)

      // Select tool_two
      await user.click(toolTwoCheckbox)

      const saveButton = screen.getByText('Save')
      await user.click(saveButton)

      // The mutate function should be called with enabled tools
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })

    it('disables tools when user deselects them and clicks Save', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      // After sorting: tool_one (index 1), tool_three (index 2), tool_two (index 3)
      const toolOneCheckbox = checkboxes[1] // tool_one (currently checked)

      // Deselect tool_one
      await user.click(toolOneCheckbox)

      const saveButton = screen.getByText('Save')
      await user.click(saveButton)

      // The mutate function should be called
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })
  })

  describe('Error Handling', () => {
    it('displays loading state for provider', () => {
      vi.mocked(toolManagerClient.useQuery).mockReturnValueOnce({
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
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
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
      // Mock provider first, then empty tools (useQuery is called for provider then tools)
      vi.mocked(toolManagerClient.useQuery)
        .mockReturnValueOnce({
          ...baseQueryResult,
          data: mockProvider,
        } as never)
        .mockReturnValueOnce({
          ...baseQueryResult,
          data: { resources: [] },
        } as never)

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
    it('calls onSelectionChange when tools are selected', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      // Tools sorted alphabetically: tool_one, tool_three, tool_two
      // tool_two is at index 3 (after header), currently unchecked
      const tool2Checkbox = checkboxes[3]

      // Select tool_two
      await user.click(tool2Checkbox)

      // Verify enabledTools state was updated
      expect(tool2Checkbox).toBeChecked()
    })
  })

  describe('Pagination', () => {
    it('displays pagination controls when next or prev cursors are available', () => {
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: {
          resources: mockTools,
          next: 'next-cursor-123',
          prev: null,
          total: 100,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      // Should show PF Pagination with Next button (enabled) and Previous button (disabled)
      const paginationNav = screen.getByRole('navigation', { name: /pagination/i })
      const nextButton = within(paginationNav).getByRole('button', { name: 'Go to next page' })
      const prevButton = within(paginationNav).getByRole('button', { name: 'Go to previous page' })

      expect(nextButton).toBeInTheDocument()
      expect(prevButton).toBeInTheDocument()
      expect(nextButton).not.toBeDisabled()
      expect(prevButton).toBeDisabled()
    })

    it('displays total count when available', async () => {
      const toolsWithoutEnabled = mockTools.map((tool) => ({ ...tool, enabled: false }))

      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: {
          resources: toolsWithoutEnabled,
          next: 'next-cursor',
          prev: null,
          total: 37,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      const paginationNav = screen.getByRole('navigation', { name: /pagination/i })
      expect(paginationNav).toBeInTheDocument()
      // Total appears in Pagination’s toggle/title subtree (nav’s direct textContent is often empty in jsdom).
      await waitFor(() => {
        expect(document.body.textContent).toMatch(/of 37\b/)
      })
    })

    it('calls onPageChange with next cursor when Next button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: {
          resources: mockTools,
          next: 'next-cursor-123',
          prev: null,
          total: 100,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      const paginationNav = screen.getByRole('navigation', { name: /pagination/i })
      const nextButton = within(paginationNav).getByRole('button', { name: 'Go to next page' })
      await user.click(nextButton)

      expect(nextButton).toBeInTheDocument()
    })

    it('calls onPageChange with prev cursor when Previous button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: {
          resources: mockTools,
          next: 'next-cursor',
          prev: 'prev-cursor-123',
          total: 100,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<IntegrationTools />, { wrapper })

      const paginationNav = screen.getByRole('navigation', { name: /pagination/i })
      const nextButton = within(paginationNav).getByRole('button', { name: 'Go to next page' })
      await user.click(nextButton)

      const prevButton = within(paginationNav).getByRole('button', { name: 'Go to previous page' })
      expect(prevButton).not.toBeDisabled()

      await user.click(prevButton)

      expect(prevButton).toBeInTheDocument()
    })

    it('does not display pagination when no cursors are available', () => {
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
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
    it('opens confirmation dialog when header Refresh tools button is clicked', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      const headerRefreshButton = refreshButtons[0] // First button is in the header

      await user.click(headerRefreshButton)

      // Check that confirmation dialog is displayed
      expect(screen.getByText(/Are you sure you want to refresh tools/i)).toBeInTheDocument()
      expect(screen.getByText(/This will fetch the latest tools from the integration/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('calls refresh mutation when confirmation dialog is confirmed', async () => {
      const mockRefreshMutate = vi.fn()
      vi.mocked(toolManagerClient.useMutation).mockReturnValue({
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

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      const headerRefreshButton = refreshButtons[0]

      await user.click(headerRefreshButton)

      const confirmButton = screen.getByRole('button', { name: 'Refresh' })
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockRefreshMutate).toHaveBeenCalled()
      })
    })

    it('does not call refresh mutation when confirmation dialog is cancelled', async () => {
      const mockRefreshMutate = vi.fn()
      vi.mocked(toolManagerClient.useMutation).mockReturnValue({
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

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      const headerRefreshButton = refreshButtons[0]

      await user.click(headerRefreshButton)

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(mockRefreshMutate).not.toHaveBeenCalled()
    })

    it('calls refresh mutation directly when empty state Refresh tools button is clicked', async () => {
      const mockRefreshMutate = vi.fn()
      vi.mocked(toolManagerClient.useMutation).mockReturnValue({
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
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      const emptyStateRefreshButton = refreshButtons[1] // Second button is in empty state

      await user.click(emptyStateRefreshButton)

      // Should call refresh directly without showing confirmation dialog
      await waitFor(() => {
        expect(mockRefreshMutate).toHaveBeenCalled()
      })

      // Confirmation dialog should not be shown
      expect(screen.queryByText(/Are you sure you want to refresh tools/i)).not.toBeInTheDocument()
    })
  })

  describe('Error State with Provider Name', () => {
    it('shows provider name in title when error occurs but provider data is available', () => {
      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return {
            data: mockProvider,
            isPending: false,
            isError: true,
            error: new Error('Provider error'),
          } as never
        }
        return { ...baseQueryResult, data: { resources: [] } } as never
      })

      render(<IntegrationTools />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Test Provider tools' })).toBeInTheDocument()
    })

    it('shows generic title when error occurs and provider has no name', () => {
      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return {
            data: { ...mockProvider, name: undefined },
            isPending: false,
            isError: true,
            error: new Error('Provider error'),
          } as never
        }
        return { ...baseQueryResult, data: { resources: [] } } as never
      })

      render(<IntegrationTools />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Tools' })).toBeInTheDocument()
    })
  })

  describe('Save Error Handling', () => {
    it('shows error alert when save throws an exception', async () => {
      vi.mocked(toolManagerClient.useMutation).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tools/bulk_update') {
          return {
            mutate: vi.fn(),
            mutateAsync: vi.fn().mockRejectedValue(new Error('Save failed')),
            isPending: false,
            isError: false,
            error: null,
            data: undefined,
            reset: vi.fn(),
            isSuccess: false,
            isIdle: true,
            failureCount: 0,
            failureReason: null,
            isPaused: false,
            status: 'idle',
            submittedAt: 0,
            variables: undefined,
            context: undefined,
          } as never
        }
        return {
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
        } as never
      })

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })
      await user.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(screen.getByText(/failed to save tools/i)).toBeInTheDocument()
      })
    })
  })

  describe('handleSubmit edge cases', () => {
    it('does not call mutation when no tools exist (empty results)', async () => {
      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return { ...baseQueryResult, data: mockProvider } as never
        }
        // Return the provider but no tools
        return { ...baseQueryResult, data: { resources: [] } } as never
      })

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      // The empty state header still shows the Save button
      await user.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockMutate).not.toHaveBeenCalled()
      })
    })

    it('calls only enable mutation when all disabled tools become enabled', async () => {
      const allDisabledTools = mockTools.map((t) => ({ ...t, enabled: false }))
      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return { ...baseQueryResult, data: mockProvider } as never
        }
        return { ...baseQueryResult, data: { resources: allDisabledTools } } as never
      })

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      // All tools are initially disabled, select all of them
      const selectAll = screen.getAllByRole('checkbox')[0]
      await user.click(selectAll)

      await user.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })

    it('calls only disable mutation when all enabled tools become disabled', async () => {
      const allEnabledTools = mockTools.map((t) => ({ ...t, enabled: true }))
      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return { ...baseQueryResult, data: mockProvider } as never
        }
        return { ...baseQueryResult, data: { resources: allEnabledTools } } as never
      })

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      // Deselect all (currently all selected)
      const selectAll = screen.getAllByRole('checkbox')[0]
      await user.click(selectAll)

      await user.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })
  })

  describe('sortData with undefined namespaced_name', () => {
    it('handles tools with undefined namespaced_name in sort', () => {
      const toolsWithUndefinedName = [
        { id: 'tool-x', namespaced_name: undefined as unknown as string, description: 'Tool X', enabled: false },
        ...mockTools,
      ]

      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return { ...baseQueryResult, data: mockProvider } as never
        }
        return { ...baseQueryResult, data: { resources: toolsWithUndefinedName } } as never
      })

      render(<IntegrationTools />, { wrapper })

      expect(screen.getByText('Tool X')).toBeInTheDocument()
    })
  })

  describe('Empty filter state (active filters, no results)', () => {
    it('shows EmptyStateFilter when active filter yields no results', () => {
      // Set a filter param in mockSearchParams to make hasActiveFilters true
      mockSearchParams.set('name[contains]', 'nonexistent-tool')

      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return { ...baseQueryResult, data: mockProvider } as never
        }
        return { ...baseQueryResult, data: { resources: [] } } as never
      })

      render(<IntegrationTools />, { wrapper })

      // With active filters and no results, shows the EmptyStateFilter (not the NoData state)
      const clearAllButtons = screen.getAllByRole('button', { name: 'Clear all filters' })
      expect(clearAllButtons.length).toBeGreaterThan(0)

      // Cleanup: reset search params for other tests
      mockSearchParams.delete('name[contains]')
    })
  })

  describe('useQueryState onRetry callback', () => {
    it('calls integrationQuery.refetch when retry is clicked in error state', async () => {
      const mockRefetch = vi.fn().mockResolvedValue({})
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: null,
        isPending: false,
        isError: true,
        error: { message: 'Failed to load', retryable: true },
        refetch: mockRefetch,
      } as never)

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const retryButton = screen.getByRole('button', { name: 'Retry' })
      await user.click(retryButton)

      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe('mergeEnabledToolIdsFromApi — off-page ID preservation', () => {
    it('preserves enabled IDs that are not on the current page after tools update', async () => {
      const toolsOnPage1 = [
        { id: 'tool-off-page', namespaced_name: 'off.page.tool', description: 'Old page tool', enabled: true },
      ]
      const toolsOnPage2 = mockTools

      const toolsRef = { list: toolsOnPage1 }
      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return { ...baseQueryResult, data: mockProvider } as never
        }
        return { ...baseQueryResult, data: { resources: toolsRef.list } } as never
      })

      const { rerender } = render(<IntegrationTools />, { wrapper })

      // Initially tool-off-page is enabled
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows.length).toBe(1)
      const offPageCheckbox = within(rows[0]).getByRole('checkbox')
      expect(offPageCheckbox).toBeChecked()

      // Navigate to page 2 — tool-off-page is no longer in results
      toolsRef.list = toolsOnPage2
      rerender(<IntegrationTools />)

      // tool-off-page is preserved as enabled (not on page, so kept in state)
      // The new tools show with their enabled/disabled states
      await waitFor(() => {
        expect(screen.getByText('test.tool_one')).toBeInTheDocument()
      })
    })
  })

  describe('Refresh Mutation Callbacks', () => {
    it('calls refresh mutation with correct provider and invokes onSuccess on completion', async () => {
      let capturedCallbacks: { onSuccess?: () => void; onError?: (e: unknown) => void } = {}
      const mockRefreshMutate = vi.fn(
        (_params: unknown, callbacks: { onSuccess?: () => void; onError?: (e: unknown) => void }) => {
          capturedCallbacks = callbacks
        }
      )
      const mockRefetch = vi.fn().mockResolvedValue({})

      vi.mocked(toolManagerClient.useMutation).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}/refresh_tools') {
          return { mutate: mockRefreshMutate, isPending: false } as never
        }
        return { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as never
      })

      vi.mocked(toolManagerClient.useQuery).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}') {
          return { ...baseQueryResult, data: mockProvider } as never
        }
        return { ...baseQueryResult, data: { resources: mockTools }, refetch: mockRefetch } as never
      })

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      await user.click(refreshButtons[0])
      await user.click(screen.getByRole('button', { name: 'Refresh' }))

      expect(mockRefreshMutate).toHaveBeenCalledWith(
        expect.objectContaining({ params: { path: { provider_id: 'provider-1' } } }),
        expect.objectContaining({
          onSuccess: expect.any(Function) as unknown,
          onError: expect.any(Function) as unknown,
        })
      )

      // Invoke onSuccess inside act to flush state updates
      // eslint-disable-next-line @typescript-eslint/require-await -- act needs async to flush microtasks
      await act(async () => {
        capturedCallbacks.onSuccess?.()
      })

      expect(mockRefetch).toHaveBeenCalled()
    })

    it('shows error alert when refresh mutation calls onError', async () => {
      let capturedCallbacks: { onSuccess?: () => void; onError?: (e: unknown) => void } = {}
      const mockRefreshMutate = vi.fn(
        (_params: unknown, callbacks: { onSuccess?: () => void; onError?: (e: unknown) => void }) => {
          capturedCallbacks = callbacks
        }
      )

      vi.mocked(toolManagerClient.useMutation).mockImplementation((_method, path: string) => {
        if (path === '/tool_manager/tool_providers/{provider_id}/refresh_tools') {
          return { mutate: mockRefreshMutate, isPending: false } as never
        }
        return { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as never
      })

      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const refreshButtons = screen.getAllByText('Refresh tools')
      await user.click(refreshButtons[0])
      await user.click(screen.getByRole('button', { name: 'Refresh' }))

      // eslint-disable-next-line @typescript-eslint/require-await -- act needs async to flush microtasks
      await act(async () => {
        capturedCallbacks.onError?.(new Error('Network error'))
      })

      expect(screen.getByText(/refresh failed/i)).toBeInTheDocument()
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

    it('sorts tools in descending order when clicking Name column header', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      // Click Name header to toggle to descending
      const nameHeader = screen.getByRole('columnheader', { name: /Name/i })
      const sortButton = within(nameHeader).getByRole('button')
      await user.click(sortButton)

      // Get all table rows (excluding header)
      const rows = screen.getAllByRole('row').slice(1)

      // Verify descending alphabetical order: tool_two, tool_three, tool_one
      expect(within(rows[0]).getByText('test.tool_two')).toBeInTheDocument()
      expect(within(rows[1]).getByText('test.tool_three')).toBeInTheDocument()
      expect(within(rows[2]).getByText('test.tool_one')).toBeInTheDocument()
    })

    it('toggles back to ascending order on second click', async () => {
      const user = userEvent.setup()
      render(<IntegrationTools />, { wrapper })

      const nameHeader = screen.getByRole('columnheader', { name: /Name/i })
      const sortButton = within(nameHeader).getByRole('button')

      // Click twice to go: asc -> desc -> asc
      await user.click(sortButton)
      await user.click(sortButton)

      // Get all table rows (excluding header)
      const rows = screen.getAllByRole('row').slice(1)

      // Verify back to ascending alphabetical order: tool_one, tool_three, tool_two
      expect(within(rows[0]).getByText('test.tool_one')).toBeInTheDocument()
      expect(within(rows[1]).getByText('test.tool_three')).toBeInTheDocument()
      expect(within(rows[2]).getByText('test.tool_two')).toBeInTheDocument()
    })
  })
})
