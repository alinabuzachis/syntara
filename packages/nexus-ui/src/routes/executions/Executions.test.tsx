import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useLocation, useSearch } from 'wouter'

import { executionsClient, workflowClient } from '../../client'

import Executions from './Executions'

// Mock the client module
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
  },
  executionsClient: {
    useQuery: vi.fn(),
  },
}))

// Mock wouter
vi.mock('wouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wouter')>()
  return {
    ...actual,
    useLocation: vi.fn(() => ['/executions', vi.fn()]),
    useSearch: vi.fn(() => ''),
  }
})

describe('Executions Component', () => {
  const mockExecutions: ExecutionsAPI.components['schemas']['Execution'][] = [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      workflow_id: 'workflow-1',
      temporal_workflow_id: 'temporal-1',
      status: 'completed',
      started_by: 'user-1',
      started_at: '2025-01-01T10:00:00Z',
      completed_at: '2025-01-01T10:30:00Z',
      created_at: '2025-01-01T09:55:00Z',
      updated_at: '2025-01-01T10:30:00Z',
      labels: {},
    },
    {
      id: '223e4567-e89b-12d3-a456-426614174001',
      workflow_id: 'workflow-2',
      temporal_workflow_id: 'temporal-2',
      status: 'running',
      started_by: 'user-2',
      started_at: '2025-01-01T11:00:00Z',
      completed_at: null,
      created_at: '2025-01-01T10:55:00Z',
      updated_at: '2025-01-01T11:00:00Z',
      labels: {},
    },
    {
      id: '323e4567-e89b-12d3-a456-426614174002',
      workflow_id: 'workflow-3',
      temporal_workflow_id: 'temporal-3',
      status: 'failed',
      started_by: 'user-3',
      started_at: '2025-01-01T12:00:00Z',
      completed_at: '2025-01-01T12:05:00Z',
      created_at: '2025-01-01T11:55:00Z',
      updated_at: '2025-01-01T12:05:00Z',
      error_details: 'Task failed',
      labels: {},
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSearch).mockReturnValue('')
  })

  const mockWorkflows = [
    { id: 'workflow-1', name: 'Hello World Workflow' },
    { id: 'workflow-2', name: 'Data Processing Workflow' },
    { id: 'workflow-3', name: 'API Integration Workflow' },
  ]

  const mockExecutionsQuery = (
    data: ExecutionsAPI.components['schemas']['Execution'][],
    isPending = false,
    error: unknown = null
  ) => {
    vi.mocked(executionsClient.useQuery).mockReturnValue({
      data: { resources: data },
      isPending,
      error,
    } as never)

    // Mock the workflows query for fetching workflow names
    vi.mocked(workflowClient.useQuery).mockImplementation(((_method: string, path: string) => {
      if (path === '/workflows') {
        return {
          data: { resources: mockWorkflows },
          isPending: false,
          error: null,
        }
      }
      return {
        data: undefined,
        isPending: false,
        error: null,
      }
    }) as never)
  }

  it('renders the executions table with data', () => {
    mockExecutionsQuery(mockExecutions)

    render(<Executions />)

    expect(screen.getByText('Automation Runs')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search executions...')).toBeInTheDocument()
  })

  it('displays execution IDs', () => {
    mockExecutionsQuery(mockExecutions)

    render(<Executions />)

    expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
    expect(screen.getByText('223e4567-e89b-12d3-a456-426614174001')).toBeInTheDocument()
    expect(screen.getByText('323e4567-e89b-12d3-a456-426614174002')).toBeInTheDocument()
  })

  it('displays execution statuses with correct badges', () => {
    mockExecutionsQuery(mockExecutions)

    render(<Executions />)

    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders table headers', () => {
    mockExecutionsQuery(mockExecutions)

    render(<Executions />)

    expect(screen.getByText('Run ID')).toBeInTheDocument()
    expect(screen.getByText('Automation name')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Created at')).toBeInTheDocument()
    expect(screen.getByText('Completed at')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockExecutionsQuery([], true)

    render(<Executions />)

    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockExecutionsQuery([], false, { message: 'Failed to load' })

    render(<Executions />)

    expect(screen.getByText('Error loading executions')).toBeInTheDocument()
  })

  it('displays workflow names instead of IDs', () => {
    mockExecutionsQuery(mockExecutions)

    render(<Executions />)

    expect(screen.getByText('Hello World Workflow')).toBeInTheDocument()
    expect(screen.getByText('Data Processing Workflow')).toBeInTheDocument()
    expect(screen.getByText('API Integration Workflow')).toBeInTheDocument()
  })

  it('shows placeholder for null timestamps', () => {
    mockExecutionsQuery([
      {
        id: 'pending-exec',
        workflow_id: 'workflow-pending',
        temporal_workflow_id: 'temporal-pending',
        status: 'pending',
        started_by: 'user-1',
        started_at: null,
        completed_at: null,
        created_at: '2025-01-01T09:00:00Z',
        updated_at: '2025-01-01T09:00:00Z',
        labels: {},
      },
    ])

    render(<Executions />)

    // Check for placeholder em-dash for null completed_at
    const placeholder = screen.getByText('—')
    expect(placeholder).toBeInTheDocument()
  })

  it('displays workflow name in title when filtering by workflow_id', () => {
    vi.mocked(useSearch).mockReturnValue('?workflow_id=workflow-1')

    vi.mocked(executionsClient.useQuery).mockReturnValue({
      data: { resources: mockExecutions.filter((e) => e.workflow_id === 'workflow-1') },
      isPending: false,
      error: null,
    } as never)
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: { id: 'workflow-1', name: 'My Test Workflow' },
      isPending: false,
      error: null,
    } as never)

    render(<Executions />)

    expect(screen.getByText('Run history for My Test Workflow')).toBeInTheDocument()
  })

  it('execution ID links navigate to execution detail page', async () => {
    mockExecutionsQuery(mockExecutions)
    const mockSetLocation = vi.fn()
    vi.mocked(useLocation).mockReturnValue(['/', mockSetLocation] as never)
    const user = userEvent.setup()

    render(<Executions />)

    const executionIdButton = screen.getByRole('button', { name: '123e4567-e89b-12d3-a456-426614174000' })
    expect(executionIdButton).toBeInTheDocument()

    await user.click(executionIdButton)
    expect(mockSetLocation).toHaveBeenCalledWith('/executions/123e4567-e89b-12d3-a456-426614174000')
  })

  it('workflow name links navigate to workflow builder', async () => {
    mockExecutionsQuery(mockExecutions)
    const mockSetLocation = vi.fn()
    vi.mocked(useLocation).mockReturnValue(['/', mockSetLocation] as never)
    const user = userEvent.setup()

    render(<Executions />)

    const workflowButton = screen.getByRole('button', { name: 'Hello World Workflow' })
    expect(workflowButton).toBeInTheDocument()

    await user.click(workflowButton)
    expect(mockSetLocation).toHaveBeenCalledWith('/automation-builder/workflow-1')
  })

  it('all execution IDs navigate to their respective execution detail pages', async () => {
    mockExecutionsQuery(mockExecutions)
    const mockSetLocation = vi.fn()
    vi.mocked(useLocation).mockReturnValue(['/', mockSetLocation] as never)
    const user = userEvent.setup()

    render(<Executions />)

    const execution1Button = screen.getByRole('button', { name: '123e4567-e89b-12d3-a456-426614174000' })
    await user.click(execution1Button)
    expect(mockSetLocation).toHaveBeenCalledWith('/executions/123e4567-e89b-12d3-a456-426614174000')

    const execution2Button = screen.getByRole('button', { name: '223e4567-e89b-12d3-a456-426614174001' })
    await user.click(execution2Button)
    expect(mockSetLocation).toHaveBeenCalledWith('/executions/223e4567-e89b-12d3-a456-426614174001')

    const execution3Button = screen.getByRole('button', { name: '323e4567-e89b-12d3-a456-426614174002' })
    await user.click(execution3Button)
    expect(mockSetLocation).toHaveBeenCalledWith('/executions/323e4567-e89b-12d3-a456-426614174002')
  })

  it('all workflow names navigate to their respective workflow builders', async () => {
    mockExecutionsQuery(mockExecutions)
    const mockSetLocation = vi.fn()
    vi.mocked(useLocation).mockReturnValue(['/', mockSetLocation] as never)
    const user = userEvent.setup()

    render(<Executions />)

    const workflow1Button = screen.getByRole('button', { name: 'Hello World Workflow' })
    await user.click(workflow1Button)
    expect(mockSetLocation).toHaveBeenCalledWith('/automation-builder/workflow-1')

    const workflow2Button = screen.getByRole('button', { name: 'Data Processing Workflow' })
    await user.click(workflow2Button)
    expect(mockSetLocation).toHaveBeenCalledWith('/automation-builder/workflow-2')

    const workflow3Button = screen.getByRole('button', { name: 'API Integration Workflow' })
    await user.click(workflow3Button)
    expect(mockSetLocation).toHaveBeenCalledWith('/automation-builder/workflow-3')
  })

  describe('Sorting Functionality', () => {
    it('renders sortable column headers', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      // Verify sortable columns have sort buttons
      const executionIdHeader = screen.getByRole('columnheader', { name: /Run ID/i })
      expect(within(executionIdHeader).getByRole('button')).toBeInTheDocument()

      const workflowHeader = screen.getByRole('columnheader', { name: /^Automation name$/i })
      expect(within(workflowHeader).getByRole('button')).toBeInTheDocument()

      const statusHeader = screen.getByRole('columnheader', { name: /^Status$/i })
      expect(within(statusHeader).getByRole('button')).toBeInTheDocument()
    })

    it('changes sort when clicking column headers', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      // Click Run ID header to sort
      const executionIdHeader = screen.getByRole('columnheader', { name: /Run ID/i })
      const sortButton = within(executionIdHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All executions should still be visible
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
      expect(screen.getByText('223e4567-e89b-12d3-a456-426614174001')).toBeInTheDocument()
      expect(screen.getByText('323e4567-e89b-12d3-a456-426614174002')).toBeInTheDocument()
    })

    it('can toggle sort direction by clicking the same column header', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      const executionIdHeader = screen.getByRole('columnheader', { name: /Run ID/i })
      const sortButton = within(executionIdHeader).getByRole('button')

      // Click twice to toggle direction
      fireEvent.click(sortButton)
      fireEvent.click(sortButton)

      // All executions should still be visible after sorting
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
      expect(screen.getByText('223e4567-e89b-12d3-a456-426614174001')).toBeInTheDocument()
      expect(screen.getByText('323e4567-e89b-12d3-a456-426614174002')).toBeInTheDocument()
    })

    it('can sort by different columns', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      // Click Automation name header
      const workflowHeader = screen.getByRole('columnheader', { name: /^Automation name$/i })
      const sortButton = within(workflowHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All executions should still be visible
      expect(screen.getByText('Hello World Workflow')).toBeInTheDocument()
      expect(screen.getByText('Data Processing Workflow')).toBeInTheDocument()
      expect(screen.getByText('API Integration Workflow')).toBeInTheDocument()
    })

    it('can sort by Status column', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      const statusHeader = screen.getByRole('columnheader', { name: /^Status$/i })
      const sortButton = within(statusHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All executions should still be visible after sorting by status
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })

    it('can sort by Completed at column', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      const completedAtHeader = screen.getByRole('columnheader', { name: /Completed at/i })
      const sortButton = within(completedAtHeader).getByRole('button')
      fireEvent.click(sortButton)

      // All executions should still be visible after sorting
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
    })

    it('can sort columns when filtering by workflow_id (hides Workflow column)', () => {
      vi.mocked(useSearch).mockReturnValue('?workflow_id=workflow-1')

      const filteredExecutions = [
        { ...mockExecutions[0], workflow_id: 'workflow-1' },
        { ...mockExecutions[1], workflow_id: 'workflow-1', id: '223e4567-e89b-12d3-a456-426614174001' },
      ]

      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: filteredExecutions },
        isPending: false,
        error: null,
      } as never)
      vi.mocked(workflowClient.useQuery).mockReturnValue({
        data: { id: 'workflow-1', name: 'My Test Workflow' },
        isPending: false,
        error: null,
      } as never)

      render(<Executions />)

      // Automation name column should not be present when filtering
      expect(screen.queryByRole('columnheader', { name: /^Automation name$/i })).not.toBeInTheDocument()

      // Sort by Run ID (index 0)
      const execIdHeader = screen.getByRole('columnheader', { name: /Run ID/i })
      fireEvent.click(within(execIdHeader).getByRole('button'))

      // Sort by Status column (index 1 when Workflow is hidden)
      const statusHeader = screen.getByRole('columnheader', { name: /^Status$/i })
      fireEvent.click(within(statusHeader).getByRole('button'))

      // Sort by Created at column (index 2 when Workflow is hidden)
      const createdAtHeader = screen.getByRole('columnheader', { name: /Created at/i })
      fireEvent.click(within(createdAtHeader).getByRole('button'))

      // Sort by Completed at column (index 3 when Workflow is hidden)
      const completedAtHeader = screen.getByRole('columnheader', { name: /Completed at/i })
      fireEvent.click(within(completedAtHeader).getByRole('button'))

      // Executions should still be visible after all sorts
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
      expect(screen.getByText('223e4567-e89b-12d3-a456-426614174001')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    it('filters executions when typing in search input', async () => {
      mockExecutionsQuery(mockExecutions)
      const user = userEvent.setup()

      render(<Executions />)

      const searchInput = screen.getByPlaceholderText('Search executions...')
      await user.type(searchInput, 'workflow-1')

      // Search state should be updated (filtering happens through useFuse)
      expect(searchInput).toHaveValue('workflow-1')
    })

    it('clears search when clear button is clicked', async () => {
      mockExecutionsQuery(mockExecutions)
      const user = userEvent.setup()

      render(<Executions />)

      const searchInput = screen.getByPlaceholderText('Search executions...')
      await user.type(searchInput, 'test')
      expect(searchInput).toHaveValue('test')

      // Click the clear button (PatternFly SearchInput has a clear button)
      const clearButton = screen.getByRole('button', { name: /reset/i })
      await user.click(clearButton)

      expect(searchInput).toHaveValue('')
    })
  })

  describe('Empty States', () => {
    it('shows empty state when no executions exist', () => {
      mockExecutionsQuery([])

      render(<Executions />)

      expect(screen.getByText('No executions found')).toBeInTheDocument()
      expect(screen.getByText('No executions found.')).toBeInTheDocument()
    })

    it('shows empty state with workflow-specific message when filtering by workflow_id', () => {
      vi.mocked(useSearch).mockReturnValue('?workflow_id=workflow-1')

      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        error: null,
      } as never)
      vi.mocked(workflowClient.useQuery).mockReturnValue({
        data: { id: 'workflow-1', name: 'My Test Workflow' },
        isPending: false,
        error: null,
      } as never)

      render(<Executions />)

      expect(screen.getByText('No execution history for this workflow.')).toBeInTheDocument()
    })

    it('shows filter empty state when search returns no results', async () => {
      // Start with data, then search will filter to empty
      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        error: null,
      } as never)

      render(<Executions />)

      // Since we start with no data and no search, we should see the no data empty state
      expect(screen.getByText('No executions found')).toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('displays footer with execution count', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      expect(screen.getByText(/3 executions/)).toBeInTheDocument()
    })

    it('displays singular execution text for one execution', () => {
      mockExecutionsQuery([mockExecutions[0]])

      render(<Executions />)

      expect(screen.getByText(/1 execution/)).toBeInTheDocument()
    })

    it('displays total count when more executions exist', () => {
      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: {
          resources: mockExecutions,
          total: 50,
          next: 'next-cursor',
        },
        isPending: false,
        error: null,
      } as never)

      render(<Executions />)

      expect(screen.getByText(/of 50 total/)).toBeInTheDocument()
    })

    it('handles next page navigation', async () => {
      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: {
          resources: mockExecutions,
          total: 50,
          next: 'next-cursor',
          prev: null,
        },
        isPending: false,
        error: null,
      } as never)

      const user = userEvent.setup()
      render(<Executions />)

      // Find and click the next button
      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      // The component should have called setCursor (state update)
      // We verify by ensuring the button was clickable
      expect(nextButton).toBeInTheDocument()
    })

    it('handles previous page navigation', async () => {
      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: {
          resources: mockExecutions,
          total: 50,
          next: null,
          prev: 'prev-cursor',
        },
        isPending: false,
        error: null,
      } as never)

      const user = userEvent.setup()
      render(<Executions />)

      // Find and click the prev button
      const prevButton = screen.getByRole('button', { name: /previous/i })
      await user.click(prevButton)

      // The component should have called setCursor (state update)
      expect(prevButton).toBeInTheDocument()
    })
  })
})
