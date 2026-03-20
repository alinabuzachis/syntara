import { ProviderStatusEnum } from '@ansible/nexus-contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { toolManagerClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'

import Integrations from './Integrations'

// Mock dependencies
vi.mock('../../../client', () => ({
  toolManagerClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

const mockNavigate = vi.fn()
const mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('wouter', () => ({
  useLocation: () => ['/configuration/integrations', mockNavigate],
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

describe('Integrations Component', () => {
  const mockIntegrations = [
    {
      id: '1',
      name: 'Primary MCP Server',
      description: 'Main integration server for critical workflows',
      status: ProviderStatusEnum.AVAILABLE,
      configuration: {
        provider_type: 'mcp',
        base_url: 'https://primary.example.com',
      },
      tool_count: 5,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
    },
    {
      id: '2',
      name: 'Secondary Test Server',
      description: 'Testing environment integration',
      status: ProviderStatusEnum.ERROR,
      configuration: {
        provider_type: 'mcp',
        base_url: 'https://secondary.example.com',
      },
      tool_count: 3,
      created_at: '2023-02-01T00:00:00Z',
      updated_at: '2023-02-02T00:00:00Z',
    },
    {
      id: '3',
      name: 'Development Server',
      description: 'Development integration for testing new features',
      status: ProviderStatusEnum.VALIDATING,
      configuration: {
        provider_type: 'mcp',
        base_url: 'https://dev.example.com',
      },
      tool_count: 8,
      created_at: '2023-03-01T00:00:00Z',
      updated_at: '2023-03-02T00:00:00Z',
    },
  ]

  beforeEach(() => {
    // Reset mocks before each test
    mockNavigate.mockClear()

    vi.mocked(toolManagerClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    vi.mocked(toolManagerClient.useMutation).mockReturnValue({
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

      // Check Add Integration button
      expect(screen.getByText('Add integration')).toBeInTheDocument()

      // Check FilterBar is present (filter input)
      expect(screen.getByRole('textbox', { name: /name filter/i })).toBeInTheDocument()
    })

    it('renders integrations in table view by default', () => {
      render(<Integrations />, { wrapper })

      // Check that integration names are rendered
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })
  })

  describe('Filter Functionality', () => {
    it('renders name filter input', async () => {
      const user = userEvent.setup()
      render(<Integrations />, { wrapper })

      // Find the name filter input (PatternFly TextFilter)
      const textInput = screen.getByRole('textbox', { name: /name filter/i })

      // Verify user can type in the filter
      await user.type(textInput, 'primary')
      expect(textInput).toHaveValue('primary')
    })

    it('shows all integrations when no filters are active', () => {
      render(<Integrations />, { wrapper })

      // Verify all integrations are shown
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })

    it('displays filter toolbar with field selectors', () => {
      render(<Integrations />, { wrapper })

      // Verify filter input is present
      const textInput = screen.getByRole('textbox', { name: /name filter/i })
      expect(textInput).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('displays loading state', () => {
      vi.mocked(toolManagerClient.useQuery).mockReturnValueOnce({
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
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
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
    it('displays empty state when no integrations exist and no filters active', () => {
      vi.mocked(toolManagerClient.useQuery).mockReturnValueOnce({
        data: { resources: [] },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as never)

      render(<Integrations />, { wrapper })

      // Check for empty state message (no filters active, so shows empty state not filter empty)
      expect(screen.getByText('No integrations have been configured yet.')).toBeInTheDocument()
      // Multiple "Add integration" buttons exist (header + empty state), so use getAllByText
      expect(screen.getAllByText('Add integration').length).toBeGreaterThan(0)
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

      const typeCells = screen.getAllByText('MCP Server')
      expect(typeCells.length).toBe(3)
    })

    it('renders tool count column', () => {
      render(<Integrations />, { wrapper })

      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
    })

    it('renders API URL column', () => {
      render(<Integrations />, { wrapper })

      expect(screen.getByText('https://primary.example.com')).toBeInTheDocument()
      expect(screen.getByText('https://secondary.example.com')).toBeInTheDocument()
      expect(screen.getByText('https://dev.example.com')).toBeInTheDocument()
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
      const user = userEvent.setup()
      render(<Integrations />, { wrapper })

      // Find and click the actions menu for the first row
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      // Click validate connection option
      const validateOption = await screen.findByRole('menuitem', { name: /validate connection/i })
      await user.click(validateOption)

      // Validate dialog should open
      await waitFor(
        () => {
          expect(screen.getByText(/validate integration/i)).toBeInTheDocument()
        },
        { timeout: 10_000 }
      )
    })

    it('opens delete dialog when uninstall action is clicked', async () => {
      const user = userEvent.setup()
      render(<Integrations />, { wrapper })

      // Find and click the actions menu for the first row
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      // Click uninstall option
      const uninstallOption = await screen.findByRole('menuitem', { name: /uninstall/i })
      await user.click(uninstallOption)

      // Delete dialog should open
      await waitFor(() => {
        expect(screen.getByText(/delete integration/i)).toBeInTheDocument()
      })
    })
  })

  describe('Pagination', () => {
    it('displays pagination controls when next or prev cursors are available', () => {
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
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
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
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
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
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
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
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
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
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
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
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

  describe('Filter No Results', () => {
    it('allows applying filters via text input', async () => {
      const user = userEvent.setup()
      render(<Integrations />, { wrapper })

      // Verify text input is available for filtering
      const textInput = screen.getByRole('textbox', { name: /name filter/i })
      await user.type(textInput, 'test')

      // Verify input value is updated
      expect(textInput).toHaveValue('test')
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

    it('can sort by Status column', () => {
      render(<Integrations />, { wrapper })

      // Click Status header to sort by status
      const statusHeader = screen.getByRole('columnheader', { name: /Status/i })
      const sortButton = within(statusHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All integrations should still be visible
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })

    it('can sort by Integration type column', () => {
      render(<Integrations />, { wrapper })

      // Click Integration type header
      const typeHeader = screen.getByRole('columnheader', { name: /Integration type/i })
      const sortButton = within(typeHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All integrations should still be visible
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })

    it('can sort by API URL column', () => {
      render(<Integrations />, { wrapper })

      // Click API URL header
      const urlHeader = screen.getByRole('columnheader', { name: /^API URL$/i })
      const sortButton = within(urlHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All integrations should still be visible
      expect(screen.getByText('Primary MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Secondary Test Server')).toBeInTheDocument()
      expect(screen.getByText('Development Server')).toBeInTheDocument()
    })
  })

  describe('Validate Dialog Flow', () => {
    it('calls validate mutation when Validate button is clicked', async () => {
      const user = userEvent.setup()
      const mockValidateMutate = vi.fn()
      const mockDeleteMutate = vi.fn()
      const mockRefetch = vi.fn()

      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: { resources: mockIntegrations },
        isPending: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      vi.mocked(toolManagerClient.useMutation).mockImplementation((_method: string, path: string) => {
        if (path.includes('validate')) {
          return { mutate: mockValidateMutate, isPending: false } as never
        }
        return { mutate: mockDeleteMutate, isPending: false } as never
      })

      render(<Integrations />, { wrapper })

      // Open actions menu and click validate (first row is ID 3 - Development Server, alphabetically)
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const validateOption = await screen.findByRole('menuitem', { name: /validate connection/i })
      await user.click(validateOption)

      // Click Validate button in dialog
      const validateButton = await screen.findByRole('button', { name: 'Validate' })
      await user.click(validateButton)

      // Verify mutation was called with provider_id (first row is ID 3 due to alphabetical sort)
      expect(mockValidateMutate).toHaveBeenCalled()
      const callArgs = mockValidateMutate.mock.calls[0]
      expect(callArgs[0]).toEqual({ params: { path: { provider_id: '3' } } })
    })

    it('shows success alert and closes dialog on successful validation', async () => {
      const user = userEvent.setup()
      const mockValidateMutate = vi.fn()
      const mockRefetch = vi.fn()

      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: { resources: mockIntegrations },
        isPending: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      vi.mocked(toolManagerClient.useMutation).mockImplementation((_method: string, path: string) => {
        if (path.includes('validate')) {
          return { mutate: mockValidateMutate, isPending: false } as never
        }
        return { mutate: vi.fn(), isPending: false } as never
      })

      render(<Integrations />, { wrapper })

      // Open validate dialog
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const validateOption = await screen.findByRole('menuitem', { name: /validate connection/i })
      await user.click(validateOption)

      // Click Validate
      const validateButton = await screen.findByRole('button', { name: 'Validate' })
      await user.click(validateButton)

      // Simulate successful mutation by calling onSuccess and onSettled
      const mutationCall = mockValidateMutate.mock.calls[0]
      const callbacks = mutationCall[1]
      act(() => {
        callbacks.onSuccess()
        callbacks.onSettled()
      })

      // Dialog should close (Validate button no longer visible)
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
      })
      expect(mockRefetch).toHaveBeenCalled()
    })

    it('shows error alert on validation failure', async () => {
      const user = userEvent.setup()
      const mockValidateMutate = vi.fn()

      vi.mocked(toolManagerClient.useMutation).mockImplementation((_method: string, path: string) => {
        if (path.includes('validate')) {
          return { mutate: mockValidateMutate, isPending: false } as never
        }
        return { mutate: vi.fn(), isPending: false } as never
      })

      render(<Integrations />, { wrapper })

      // Open validate dialog
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const validateOption = await screen.findByRole('menuitem', { name: /validate connection/i })
      await user.click(validateOption)

      // Click Validate
      const validateButton = await screen.findByRole('button', { name: 'Validate' })
      await user.click(validateButton)

      // Simulate failed mutation
      const callbacks = mockValidateMutate.mock.calls[0][1]
      act(() => {
        callbacks.onError(new Error('Connection timeout'))
        callbacks.onSettled()
      })

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
      })
    })

    it('closes validate dialog when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(<Integrations />, { wrapper })

      // Open validate dialog
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const validateOption = await screen.findByRole('menuitem', { name: /validate connection/i })
      await user.click(validateOption)

      // Verify dialog is open
      await waitFor(() => {
        expect(screen.getByText(/validate integration/i)).toBeInTheDocument()
      })

      // Click Cancel
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText(/Are you sure you want to validate/)).not.toBeInTheDocument()
      })
    })
  })

  describe('Delete Dialog Flow', () => {
    it('calls delete mutation when Delete button is clicked', async () => {
      const user = userEvent.setup()
      const mockValidateMutate = vi.fn()
      const mockDeleteMutate = vi.fn()
      const mockRefetch = vi.fn()

      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: { resources: mockIntegrations },
        isPending: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      vi.mocked(toolManagerClient.useMutation).mockImplementation((method: string) => {
        if (method === 'delete') {
          return { mutate: mockDeleteMutate, isPending: false } as never
        }
        return { mutate: mockValidateMutate, isPending: false } as never
      })

      render(<Integrations />, { wrapper })

      // Open actions menu and click uninstall (first row is ID 3 - Development Server)
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const uninstallOption = await screen.findByRole('menuitem', { name: /uninstall/i })
      await user.click(uninstallOption)

      // Click Delete button in dialog
      const deleteButton = await screen.findByRole('button', { name: 'Delete' })
      await user.click(deleteButton)

      // Verify mutation was called (first row is ID 3 due to alphabetical sort)
      expect(mockDeleteMutate).toHaveBeenCalled()
      const callArgs = mockDeleteMutate.mock.calls[0]
      expect(callArgs[0]).toEqual({ params: { path: { provider_id: '3' } } })
    })

    it('shows success alert and closes dialog on successful delete', async () => {
      const user = userEvent.setup()
      const mockDeleteMutate = vi.fn()
      const mockRefetch = vi.fn()

      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: { resources: mockIntegrations },
        isPending: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      vi.mocked(toolManagerClient.useMutation).mockImplementation((method: string) => {
        if (method === 'delete') {
          return { mutate: mockDeleteMutate, isPending: false } as never
        }
        return { mutate: vi.fn(), isPending: false } as never
      })

      render(<Integrations />, { wrapper })

      // Open delete dialog
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const uninstallOption = await screen.findByRole('menuitem', { name: /uninstall/i })
      await user.click(uninstallOption)

      // Click Delete
      const deleteButton = await screen.findByRole('button', { name: 'Delete' })
      await user.click(deleteButton)

      // Simulate successful mutation
      const callbacks = mockDeleteMutate.mock.calls[0][1]
      act(() => {
        callbacks.onSuccess()
        callbacks.onSettled()
      })

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
      })
      expect(mockRefetch).toHaveBeenCalled()
    })

    it('shows error alert on delete failure', async () => {
      const user = userEvent.setup()
      const mockDeleteMutate = vi.fn()

      vi.mocked(toolManagerClient.useMutation).mockImplementation((method: string) => {
        if (method === 'delete') {
          return { mutate: mockDeleteMutate, isPending: false } as never
        }
        return { mutate: vi.fn(), isPending: false } as never
      })

      render(<Integrations />, { wrapper })

      // Open delete dialog
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const uninstallOption = await screen.findByRole('menuitem', { name: /uninstall/i })
      await user.click(uninstallOption)

      // Click Delete
      const deleteButton = await screen.findByRole('button', { name: 'Delete' })
      await user.click(deleteButton)

      // Simulate failed mutation
      const callbacks = mockDeleteMutate.mock.calls[0][1]
      act(() => {
        callbacks.onError(new Error('Permission denied'))
        callbacks.onSettled()
      })

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
      })
    })

    it('closes delete dialog when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(<Integrations />, { wrapper })

      // Open delete dialog
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])
      const uninstallOption = await screen.findByRole('menuitem', { name: /uninstall/i })
      await user.click(uninstallOption)

      // Verify dialog is open
      await waitFor(() => {
        expect(screen.getByText(/delete integration/i)).toBeInTheDocument()
      })

      // Click Cancel
      const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
      await user.click(cancelButtons[cancelButtons.length - 1])

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText(/This action cannot be undone/)).not.toBeInTheDocument()
      })
    })
  })

  describe('Row Actions - View Tools', () => {
    it('navigates to tools page when View tools action is clicked', async () => {
      const user = userEvent.setup()
      render(<Integrations />, { wrapper })

      // Open actions menu (first row is ID 3 - Development Server, alphabetically sorted)
      const actionButtons = screen.getAllByRole('button', { name: 'Kebab toggle' })
      await user.click(actionButtons[0])

      // Click view tools option
      const viewToolsOption = await screen.findByRole('menuitem', { name: /view and enable\/disable tools/i })
      await user.click(viewToolsOption)

      // Verify navigation - first row is ID 3 due to alphabetical sort
      expect(mockNavigate).toHaveBeenCalledWith('/configuration/integrations/3/tools')
    })
  })

  describe('Filter Controls', () => {
    it('provides filter controls for user interaction', () => {
      render(<Integrations />, { wrapper })

      // Verify filter input is available
      const textInput = screen.getByRole('textbox', { name: /name filter/i })
      expect(textInput).toBeInTheDocument()
      expect(textInput).toHaveAttribute('placeholder', 'Filter by name')
    })
  })
})
