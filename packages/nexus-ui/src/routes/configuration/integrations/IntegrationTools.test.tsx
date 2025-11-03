import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import IntegrationTools from './IntegrationTools'
import { toolProvidersClient, toolsClient } from '../../../client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AlertProvider } from '@ansible/nexus-ui-framework'

// Mock dependencies
vi.mock('../../../client', () => ({
  toolProvidersClient: {
    useQuery: vi.fn(),
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

vi.mock('../../../components/chat/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input">Chat Input</div>,
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
    status: 'connected',
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

    vi.mocked(toolsClient.useQuery).mockReturnValue({
      data: { resources: mockTools },
      isPending: false,
      isError: false,
      error: null,
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

    it('renders ChatInput component', () => {
      render(<IntegrationTools />, { wrapper })

      expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    })

    it('displays correct item count', () => {
      render(<IntegrationTools />, { wrapper })

      // Since 2 tools are enabled by default (tool-1 and tool-3), it shows selection count
      expect(screen.getByText('2 of 3 items selected')).toBeInTheDocument()
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

      // Should show 3 items selected (all tools now selected)
      expect(screen.getByText('3 of 3 items selected')).toBeInTheDocument()
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

      // All tools should now be selected
      expect(screen.getByText('3 of 3 items selected')).toBeInTheDocument()
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
      expect(screen.getByText('3 items')).toBeInTheDocument()
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
      vi.mocked(toolProvidersClient.useQuery).mockReturnValueOnce({
        data: null,
        isPending: false,
        isError: true,
        error: mockError,
      })

      render(<IntegrationTools />, { wrapper })

      // Check for error state
      const errorElement = screen.getByTestId('error-state')
      expect(errorElement).toBeInTheDocument()
      expect(screen.getByText('Error loading tools')).toBeInTheDocument()
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
      })

      render(<IntegrationTools />, { wrapper })

      // Check for empty state message and button
      expect(screen.getByText('No integrations have been configured yet.')).toBeInTheDocument()
      expect(screen.getByText('Add Integration')).toBeInTheDocument()
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
      const consoleSpy = vi.spyOn(console, 'log')

      render(<IntegrationTools />, { wrapper })

      const checkboxes = screen.getAllByRole('checkbox')
      const tool2Checkbox = checkboxes[2] // tool-2

      // Select tool-2
      fireEvent.click(tool2Checkbox)

      // Console log should be called with selection count
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('tools enabled'))
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
})
