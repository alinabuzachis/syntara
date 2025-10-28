import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import Automations from './Automations'
import { workflowClient } from '../../client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock dependencies
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
  },
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

describe('Automations Component', () => {
  const mockWorkflows = [
    {
      id: '1',
      name: 'Important Project Workflow',
      description: 'Complex workflow for critical project',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
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
      labels: {
        type: 'routine',
        status: 'maintenance',
      },
    },
  ]

  beforeEach(() => {
    // Reset mocks before each test
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: { workflows: mockWorkflows },
      isPending: false,
      isError: false,
      error: null,
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

    it('renders description column', () => {
      render(<Automations />, { wrapper })

      expect(screen.getByText('Complex workflow for critical project')).toBeInTheDocument()
      expect(screen.getByText('Routine workflow for secondary tasks')).toBeInTheDocument()
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
})
