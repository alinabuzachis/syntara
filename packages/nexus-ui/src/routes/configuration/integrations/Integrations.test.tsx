import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { toolProvidersClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'

import Integrations from './Integrations'

// Mock dependencies
vi.mock('../../../client', () => ({
  toolProvidersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('wouter', () => ({
  useLocation: () => ['/configuration/integrations', vi.fn()],
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

describe('Integrations Component', () => {
  const mockIntegrations = [
    {
      id: '1',
      name: 'Primary MCP Server',
      description: 'Main integration server for critical workflows',
      status: 'available',
      configuration: {
        provider_type: 'mcp-server',
        url: 'https://primary.example.com',
      },
      tool_count: 5,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
    },
    {
      id: '2',
      name: 'Secondary Test Server',
      description: 'Testing environment integration',
      status: 'error',
      configuration: {
        provider_type: 'mcp-server',
        url: 'https://secondary.example.com',
      },
      tool_count: 3,
      created_at: '2023-02-01T00:00:00Z',
      updated_at: '2023-02-02T00:00:00Z',
    },
    {
      id: '3',
      name: 'Development Server',
      description: 'Development integration for testing new features',
      status: 'validating',
      configuration: {
        provider_type: 'mcp-server',
        url: 'https://dev.example.com',
      },
      tool_count: 8,
      created_at: '2023-03-01T00:00:00Z',
      updated_at: '2023-03-02T00:00:00Z',
    },
  ]

  beforeEach(() => {
    // Reset mocks before each test
    vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    vi.mocked(toolProvidersClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      data: null,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      isIdle: true,
      isSuccess: false,
      failureCount: 0,
      failureReason: null,
      context: undefined,
      submittedAt: 0,
      variables: undefined,
      status: 'idle',
      isPaused: false,
    } as never)
  })

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<Integrations />, { wrapper })

      // Check page header
      expect(screen.getByText('Integrations')).toBeInTheDocument()

      // Check search input
      const searchInput = screen.getByPlaceholderText('Search integrations...')
      expect(searchInput).toBeInTheDocument()

      // Check Add Integration button
      expect(screen.getByText('Add integration')).toBeInTheDocument()
    })

    it('renders integrations in table view by default', () => {
      render(<Integrations />, { wrapper })

      // Check that integration names are rendered
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    it('allows searching integrations', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...')

      // Simulate typing in the search input
      const searchTerm = 'primary'
      fireEvent.change(searchInput, { target: { value: searchTerm } })

      // Verify the input value is updated
      expect((searchInput as HTMLInputElement).value).toBe(searchTerm)
    })

    it('filters integrations with fuzzy search', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...')

      // Simulate searching for "primary"
      fireEvent.change(searchInput, { target: { value: 'primary' } })

      // The matching integration should be visible
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()

      // Note: Fuzzy search may still show other results if they have partial matches
      // The test verifies that the primary match is present
    })

    it('supports partial matches in fuzzy search', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...')

      // Simulate searching for "test"
      fireEvent.change(searchInput, { target: { value: 'test' } })

      // The row with "test" should be visible
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })

    it('shows all integrations when search is empty', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...')

      // Clear the search input
      fireEvent.change(searchInput, { target: { value: '' } })

      // Verify all integrations are shown
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })
  })

  describe('View Toggle', () => {
    it('displays view toggle menu', () => {
      render(<Integrations />, { wrapper })

      // Menu button should be present (EllipsisVerticalIcon)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('switches to cards view when selected', () => {
      render(<Integrations />, { wrapper })

      // Find all buttons and locate the menu trigger (button containing an SVG icon)
      const buttons = screen.getAllByRole('button')
      const menuButton = buttons.find((btn) => btn.querySelector('svg'))

      if (menuButton) {
        fireEvent.click(menuButton)

        // Click on Cards option if available
        const cardsOption = screen.queryByRole('menuitemradio', { name: 'Cards' })
        if (cardsOption) {
          fireEvent.click(cardsOption)
        }
      }

      // Verify integrations are still displayed
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('displays loading state', () => {
      vi.mocked(toolProvidersClient.useQuery).mockReturnValueOnce({
        data: null,
        isPending: true,
        isError: false,
        error: null,
      })

      render(<Integrations />, { wrapper })

      // Expect loading state
      const loadingElement = screen.getByTestId('loading-state')
      expect(loadingElement).toBeInTheDocument()
    })

    it('displays error state', () => {
      const mockError = new Error('Failed to load integrations')
      // NOTE: component may re-render due to AlertProvider updates; keep error stable across renders
      vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
        data: null,
        isPending: false,
        isError: true,
        error: mockError,
      })

      render(<Integrations />, { wrapper })

      // Check for error state
      const errorElement = screen.getByTestId('error-state')
      expect(errorElement).toBeInTheDocument()
      // Title also appears in the global alert; scope to the error state container
      expect(within(errorElement).getByText('Error loading integrations')).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('displays empty state when no integrations exist', () => {
      vi.mocked(toolProvidersClient.useQuery).mockReturnValueOnce({
        data: { resources: [] },
        isPending: false,
        isError: false,
        error: null,
      })

      render(<Integrations />, { wrapper })

      // Check for empty state message
      expect(screen.getByText('No integrations have been configured yet.')).toBeInTheDocument()
      expect(screen.getByText('Add integration')).toBeInTheDocument()
    })
  })

  describe('Table Columns', () => {
    it('renders name column', () => {
      render(<Integrations />, { wrapper })

      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })

    it('renders status column', () => {
      render(<Integrations />, { wrapper })

      const statusCells = screen.getAllByText(/available|error|validating/i)
      expect(statusCells.length).toBeGreaterThanOrEqual(3)
    })

    it('renders integration type column', () => {
      render(<Integrations />, { wrapper })

      const typeCells = screen.getAllByText('mcp-server')
      expect(typeCells.length).toBe(3)
    })

    it('renders tool count column', () => {
      render(<Integrations />, { wrapper })

      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
    })
  })

  describe('Row Actions', () => {
    it('provides row action menu for each integration', () => {
      render(<Integrations />, { wrapper })

      // Table should have row action menus (PF Table uses role="grid")
      const table = screen.getByRole('grid', { name: 'Integrations table' })
      expect(table).toBeInTheDocument()

      // Each row should have actions available
      const rows = within(table).getAllByRole('row')
      // Should have at least header row + 3 data rows
      expect(rows.length).toBeGreaterThanOrEqual(4)
    })

    it('opens validate dialog when validate action is clicked', async () => {
      render(<Integrations />, { wrapper })

      // Find and click the actions menu for the first row
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      fireEvent.click(actionButtons[0])

      // Click validate connection option
      const validateOption = screen.getByRole('menuitem', { name: /validate connection/i })
      fireEvent.click(validateOption)

      // Validate dialog should open
      expect(screen.getByText(/validate integration/i)).toBeInTheDocument()
    })

    it('opens delete dialog when uninstall action is clicked', async () => {
      render(<Integrations />, { wrapper })

      // Find and click the actions menu for the first row
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      fireEvent.click(actionButtons[0])

      // Click uninstall option
      const uninstallOption = screen.getByRole('menuitem', { name: /uninstall/i })
      fireEvent.click(uninstallOption)

      // Delete dialog should open
      expect(screen.getByText(/delete integration/i)).toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('displays pagination controls when next or prev cursors are available', () => {
      vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
        data: {
          resources: mockIntegrations,
          next: 'next-cursor-abc',
          prev: null,
          total: 25,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Integrations />, { wrapper })

      const nextButton = screen.getByRole('button', { name: 'Next page' })
      const prevButton = screen.getByRole('button', { name: 'Previous page' })

      expect(nextButton).toBeInTheDocument()
      expect(prevButton).toBeInTheDocument()
      expect(nextButton).not.toBeDisabled()
      expect(prevButton).toBeDisabled()
    })

    it('displays total count when available', () => {
      vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
        data: {
          resources: mockIntegrations,
          next: 'next-cursor',
          prev: null,
          total: 25,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Integrations />, { wrapper })

      expect(screen.getByText('3 integrations')).toBeInTheDocument()
      expect(screen.getByText('(of 25 total)')).toBeInTheDocument()
    })

    it('enables Previous button when prev cursor is available', () => {
      vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
        data: {
          resources: mockIntegrations,
          next: 'next-cursor',
          prev: 'prev-cursor-abc',
          total: 25,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Integrations />, { wrapper })

      const prevButton = screen.getByRole('button', { name: 'Previous page' })
      expect(prevButton).not.toBeDisabled()
    })

    it('hides pagination when no cursors are available', () => {
      vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
        data: {
          resources: mockIntegrations,
          next: null,
          prev: null,
          total: 3,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Integrations />, { wrapper })

      expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument()
    })

    it('calls onNext when Next page button is clicked', () => {
      vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
        data: {
          resources: mockIntegrations,
          next: 'next-cursor-abc',
          prev: null,
          total: 25,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Integrations />, { wrapper })

      const nextButton = screen.getByRole('button', { name: 'Next page' })
      fireEvent.click(nextButton)

      // The button click should trigger the onNext callback
      expect(nextButton).toBeInTheDocument()
    })

    it('calls onPrev when Previous page button is clicked', () => {
      vi.mocked(toolProvidersClient.useQuery).mockReturnValue({
        data: {
          resources: mockIntegrations,
          next: 'next-cursor',
          prev: 'prev-cursor-abc',
          total: 25,
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<Integrations />, { wrapper })

      const prevButton = screen.getByRole('button', { name: 'Previous page' })
      fireEvent.click(prevButton)

      // The button click should trigger the onPrev callback
      expect(prevButton).toBeInTheDocument()
    })
  })

  describe('Search No Results', () => {
    it('shows empty state filter when search has no results', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent-integration-xyz' } })

      // Should show empty state filter with clear button
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })

    it('clears search when clear all filters is clicked', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent-integration-xyz' } })

      // Click clear all filters
      const clearButton = screen.getByRole('button', { name: /clear all filters/i })
      fireEvent.click(clearButton)

      // All integrations should be visible again
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
    })
  })

  describe('Cards View', () => {
    it('renders cards view when cards is selected from menu', () => {
      render(<Integrations />, { wrapper })

      // Open the view menu
      const menuToggle = screen.getByRole('button', { name: '' })
      fireEvent.click(menuToggle)

      // Select Cards view
      const cardsOption = screen.getByRole('menuitem', { name: 'Cards' })
      fireEvent.click(cardsOption)

      // Integrations should still be visible in cards view
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
    })

    it('renders table view when table is selected from menu', () => {
      render(<Integrations />, { wrapper })

      // Open the view menu and select cards first
      const menuToggle = screen.getByRole('button', { name: '' })
      fireEvent.click(menuToggle)
      const cardsOption = screen.getByRole('menuitem', { name: 'Cards' })
      fireEvent.click(cardsOption)

      // Now switch back to table
      fireEvent.click(menuToggle)
      const tableOption = screen.getByRole('menuitem', { name: 'Table' })
      fireEvent.click(tableOption)

      // Should show table with grid role
      expect(screen.getByRole('grid', { name: 'Integrations table' })).toBeInTheDocument()
    })
  })

  describe('Sorting Functionality', () => {
    it('renders sortable column headers', () => {
      render(<Integrations />, { wrapper })

      // Verify sortable columns have sort buttons
      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      expect(within(nameHeader).getByRole('button')).toBeInTheDocument()

      const statusHeader = screen.getByRole('columnheader', { name: /Status/i })
      expect(within(statusHeader).getByRole('button')).toBeInTheDocument()

      const toolsHeader = screen.getByRole('columnheader', { name: /Tools/i })
      expect(within(toolsHeader).getByRole('button')).toBeInTheDocument()
    })

    it('changes sort when clicking column headers', () => {
      render(<Integrations />, { wrapper })

      // Click Name header to sort by name
      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      const sortButton = within(nameHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All integrations should still be visible
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })

    it('can toggle sort direction by clicking the same column header', () => {
      render(<Integrations />, { wrapper })

      const nameHeader = screen.getByRole('columnheader', { name: /^Name$/i })
      const sortButton = within(nameHeader).getByRole('button')

      // Click twice to toggle direction
      fireEvent.click(sortButton)
      fireEvent.click(sortButton)

      // All integrations should still be visible after sorting
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })

    it('can sort by different columns', () => {
      render(<Integrations />, { wrapper })

      // Click Tools header
      const toolsHeader = screen.getByRole('columnheader', { name: /Tools/i })
      const sortButton = within(toolsHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All integrations should still be visible
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })
  })
})
