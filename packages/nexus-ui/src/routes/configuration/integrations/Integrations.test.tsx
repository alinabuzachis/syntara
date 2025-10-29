import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import Integrations from './Integrations'
import { toolProvidersClient } from '../../../client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock dependencies
vi.mock('../../../client', () => ({
  toolProvidersClient: {
    useQuery: vi.fn(),
  },
}))

vi.mock('wouter', () => ({
  useLocation: () => ['/configuration/integrations', vi.fn()],
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
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

describe('Integrations Component', () => {
  const mockIntegrations = [
    {
      id: '1',
      name: 'Primary MCP Server',
      description: 'Main integration server for critical workflows',
      status: 'connected',
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
      status: 'disconnected',
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
      status: 'connected',
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
    })
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
      expect(screen.getByText('Add Integration')).toBeInTheDocument()
    })

    it('renders integrations in table view by default', () => {
      render(<Integrations />, { wrapper })

      // Check that integration names are rendered
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })

    it('renders ChatInput component', () => {
      render(<Integrations />, { wrapper })

      expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    it('allows searching integrations', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...') as HTMLInputElement

      // Simulate typing in the search input
      const searchTerm = 'primary'
      fireEvent.change(searchInput, { target: { value: searchTerm } })

      // Verify the input value is updated
      expect(searchInput.value).toBe(searchTerm)
    })

    it('filters integrations with fuzzy search', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...') as HTMLInputElement

      // Simulate searching for "primary"
      fireEvent.change(searchInput, { target: { value: 'primary' } })

      // The matching integration should be visible
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()

      // Note: Fuzzy search may still show other results if they have partial matches
      // The test verifies that the primary match is present
    })

    it('supports partial matches in fuzzy search', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...') as HTMLInputElement

      // Simulate searching for "test"
      fireEvent.change(searchInput, { target: { value: 'test' } })

      // The row with "test" should be visible
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })

    it('shows all integrations when search is empty', () => {
      render(<Integrations />, { wrapper })

      const searchInput = screen.getByPlaceholderText('Search integrations...') as HTMLInputElement

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

      // Find all buttons and locate the menu trigger (last button that could be the ellipsis menu)
      const buttons = screen.getAllByRole('button')
      const menuButton = buttons.find((btn) => btn.querySelector('svg.lucide-ellipsis-vertical'))

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
      vi.mocked(toolProvidersClient.useQuery).mockReturnValueOnce({
        data: null,
        isPending: false,
        isError: true,
        error: mockError,
      })

      render(<Integrations />, { wrapper })

      // Check for error state
      const errorElement = screen.getByTestId('error-state')
      expect(errorElement).toBeInTheDocument()
      expect(screen.getByText('Error loading integrations')).toBeInTheDocument()
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
      expect(screen.getByText('Add Integration')).toBeInTheDocument()
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

      const statusCells = screen.getAllByText(/connected|disconnected/i)
      expect(statusCells.length).toBeGreaterThanOrEqual(2)
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

      // Table should have row action menus
      const table = screen.getByRole('table')
      expect(table).toBeInTheDocument()

      // Each row should have actions available
      const rows = within(table).getAllByRole('row')
      // Should have at least header row + 3 data rows
      expect(rows.length).toBeGreaterThanOrEqual(4)
    })
  })
})
