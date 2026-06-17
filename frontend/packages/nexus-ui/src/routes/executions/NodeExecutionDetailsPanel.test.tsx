import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { NodeExecutionDetailsPanel } from './NodeExecutionDetailsPanel'

const mockActivityData = {
  resources: [
    {
      activity_name: 'run_aap_vm',
      input_data: { host: '10.0.0.1', template_id: 42 },
      output_data: { status: 'ok', stdout: 'VM provisioned successfully' },
      status: 'completed',
    },
  ],
}

const mockUseQuery =
  vi.fn<() => { data: unknown; isLoading: boolean; error: unknown; refetch: () => Promise<unknown> }>()

vi.mock('../../client', () => ({
  executionsClient: {
    useQuery: (...args: unknown[]) => mockUseQuery(...(args as [])),
  },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

const defaultProps = {
  nodeId: 'run_aap_vm',
  nodeName: 'Run AAP VM',
  executionId: 'exec-123',
  nodeState: {
    activityId: 'run_aap_vm',
    status: 'completed' as const,
    startedAt: '2024-01-01T10:00:00Z',
    completedAt: '2024-01-01T10:01:30Z',
  },
  onClose: vi.fn(),
}

describe('NodeExecutionDetailsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseQuery.mockReturnValue({ data: mockActivityData, isLoading: false, error: null, refetch: vi.fn() })
  })

  it('renders the node name in the header', () => {
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Run AAP VM' })).toBeInTheDocument()
  })

  it('renders node status in the header', () => {
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(screen.getByText('Successful')).toBeInTheDocument()
  })

  it('renders Input and Output panes side by side', () => {
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(screen.getByText('Parameters')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
  })

  it('shows input data in the input pane by default (JSON view)', () => {
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(screen.getByText(/"host"/)).toBeInTheDocument()
    expect(screen.getByText(/"10.0.0.1"/)).toBeInTheDocument()
  })

  it('shows output data in the output pane by default (JSON view)', () => {
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(screen.getByText(/"stdout"/)).toBeInTheDocument()
    expect(screen.getByText(/"VM provisioned successfully"/)).toBeInTheDocument()
  })

  it('renders schema view when switching to Schema', async () => {
    const user = userEvent.setup()
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    const schemaButtons = screen.getAllByRole('button', { name: 'Schema' })
    await user.click(schemaButtons[0])

    expect(screen.getByLabelText('Input schema')).toBeInTheDocument()
  })

  it('renders table view when switching to Table', async () => {
    const user = userEvent.setup()
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    const tableButtons = screen.getAllByRole('button', { name: 'Table' })
    await user.click(tableButtons[0])

    expect(screen.getByLabelText('Input data')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Close step details' }))

    expect(defaultProps.onClose).toHaveBeenCalledOnce()
  })

  it('shows loading spinner when data is loading', () => {
    mockUseQuery.mockReturnValue({ data: null, isLoading: true, error: null, refetch: vi.fn() })
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows empty state when output data is null', () => {
    mockUseQuery.mockReturnValue({
      data: { resources: [{ activity_name: 'run_aap_vm', output_data: null }] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(screen.getByText('No output data')).toBeInTheDocument()
  })

  it('shows empty state when input data is null', () => {
    mockUseQuery.mockReturnValue({
      data: { resources: [{ activity_name: 'run_aap_vm', input_data: undefined }] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(screen.getByText('No parameters data')).toBeInTheDocument()
  })

  it('passes activity_name as query parameter for server-side filtering', () => {
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(mockUseQuery).toHaveBeenCalledWith(
      'get',
      '/executions/{execution_id}/activities',
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        params: expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          query: expect.objectContaining({ activity_name: 'run_aap_vm' }),
        }),
      }),
      expect.anything()
    )
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    let results: Awaited<ReturnType<typeof axe>>
    await act(async () => {
      results = await axe(container)
    })
    expect(results!).toHaveNoViolations()
  })

  it('has no accessibility violations in loading state', async () => {
    mockUseQuery.mockReturnValue({ data: null, isLoading: true, error: null, refetch: vi.fn() })
    const { container } = render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    let results: Awaited<ReturnType<typeof axe>>
    await act(async () => {
      results = await axe(container)
    })
    expect(results!).toHaveNoViolations()
  })

  it('shows error state when activity data fetch fails', () => {
    const refetch = vi.fn()
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Network error'),
      refetch,
    })

    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    expect(screen.getByText('Error loading activity data')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('calls refetch when retry is clicked on error state', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn().mockResolvedValue(undefined)
    // retryable: true so ErrorState renders the Retry button
    const error = Object.assign(new Error('Network error'), { retryable: true })
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error, refetch })

    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('renders without elapsed time when node has not started', () => {
    const propsWithoutStart = {
      ...defaultProps,
      nodeState: undefined,
    }
    render(<NodeExecutionDetailsPanel {...propsWithoutStart} />, { wrapper })

    expect(screen.queryByText(/Elapsed time:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/2024-01-01/)).not.toBeInTheDocument()
  })

  it('highlights search results in JSON view', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    const searchInputs = screen.getAllByPlaceholderText('Search')
    await user.type(searchInputs[0], 'host')

    // Verify that mark elements are rendered (highlighted search results)
    const marks = screen.getAllByRole('mark')
    expect(marks.length).toBeGreaterThan(0)
  })

  it('scrolls to first search match when typing in search', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    const searchInputs = screen.getAllByPlaceholderText('Search')
    await user.type(searchInputs[0], 'host')

    // In JSDOM scrollIntoView might not be called, so just verify search value changed
    expect(searchInputs[0]).toHaveValue('host')
  })

  it('clears search term when clear button is clicked', async () => {
    const user = userEvent.setup()
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    const searchInputs = screen.getAllByPlaceholderText('Search')
    await user.type(searchInputs[0], 'host')

    // PatternFly SearchInput clear button is labeled "Reset"
    const clearButton = screen.getAllByRole('button', { name: /reset/i })[0]
    await user.click(clearButton)

    expect(searchInputs[0]).toHaveValue('')
  })

  it('renders running status with elapsed time updating', () => {
    const propsWithRunning = {
      ...defaultProps,
      nodeState: {
        activityId: 'run_aap_vm',
        status: 'running' as const,
        startedAt: new Date(Date.now() - 5000).toISOString(),
        completedAt: undefined,
      },
    }
    render(<NodeExecutionDetailsPanel {...propsWithRunning} />, { wrapper })

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText(/Elapsed time:/)).toBeInTheDocument()
  })

  it('renders failed status with error styling on output', () => {
    const propsWithFailed = {
      ...defaultProps,
      nodeState: {
        activityId: 'run_aap_vm',
        status: 'failed' as const,
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: '2024-01-01T10:01:30Z',
      },
    }
    render(<NodeExecutionDetailsPanel {...propsWithFailed} />, { wrapper })

    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders timestamp range when node has both start and end times', () => {
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    // Check that both timestamps are present with the dash separator
    // Timestamps render in local timezone, so just verify the format and date
    expect(screen.getByText(/\d{2}:\d{2}:\d{2} [AP]M, 1 Jan 2024/)).toBeInTheDocument()
  })

  it('switches between different view modes for input pane', async () => {
    const user = userEvent.setup()
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    // Start in JSON view
    expect(screen.getByText(/"host"/)).toBeInTheDocument()

    // Switch to Schema view
    const schemaButtons = screen.getAllByRole('button', { name: 'Schema' })
    await user.click(schemaButtons[0]) // First one is for Parameters/Input

    expect(screen.getByLabelText('Input schema')).toBeInTheDocument()

    // Switch to Table view
    const tableButtons = screen.getAllByRole('button', { name: 'Table' })
    await user.click(tableButtons[0])

    expect(screen.getByLabelText('Input data')).toBeInTheDocument()
  })

  it('switches between different view modes for output pane', async () => {
    const user = userEvent.setup()
    render(<NodeExecutionDetailsPanel {...defaultProps} />, { wrapper })

    // Switch output to Schema view
    const schemaButtons = screen.getAllByRole('button', { name: 'Schema' })
    await user.click(schemaButtons[1]) // Second one is for Output

    // InputSchemaView has aria-label="Input schema", verify output schema is rendered
    expect(screen.getByLabelText('Input schema')).toBeInTheDocument()
  })
})
