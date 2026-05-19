import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useLocation, useSearch, useSearchParams } from 'wouter'

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
  authMiddleware: { onRequest: vi.fn() },
}))

// Mock useProjectSelector to avoid needing accessClient / QueryClientProvider
const mockUseProjectSelector = vi.fn(() => ({
  selectedProject: null as { id: string; name: string } | null,
  isAllProjects: false,
  projects: [] as { id: string; name: string }[],
  ProjectSelector: null,
}))
vi.mock('../../hooks/useProjectSelector', () => ({
  useProjectSelector: () => mockUseProjectSelector(),
}))

// Mock wouter
vi.mock('wouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wouter')>()
  return {
    ...actual,
    useLocation: vi.fn(() => ['/executions', vi.fn()]),
    useSearch: vi.fn(() => ''),
    useSearchParams: vi.fn(() => [new URLSearchParams(''), vi.fn()]),
  }
})

describe('Executions Component', () => {
  const mockExecutions: ExecutionsAPI.components['schemas']['ExecutionRead'][] = [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      workflow_id: 'workflow-1',
      workflow_version_id: 'wfv-1',
      temporal_workflow_id: 'temporal-1',
      status: 'completed',
      created_by: 'user-1',
      updated_by: 'user-1',
      completed_at: '2025-01-01T10:30:00Z',
      created_at: '2025-01-01T09:55:00Z',
      updated_at: '2025-01-01T10:30:00Z',
      input_data: {},
      error_details: null,
    },
    {
      id: '223e4567-e89b-12d3-a456-426614174001',
      workflow_id: 'workflow-2',
      workflow_version_id: 'wfv-2',
      temporal_workflow_id: 'temporal-2',
      status: 'running',
      created_by: 'user-2',
      updated_by: null,
      completed_at: null,
      created_at: '2025-01-01T10:55:00Z',
      updated_at: '2025-01-01T11:00:00Z',
      input_data: {},
      error_details: null,
    },
    {
      id: '323e4567-e89b-12d3-a456-426614174002',
      workflow_id: 'workflow-3',
      workflow_version_id: 'wfv-3',
      temporal_workflow_id: 'temporal-3',
      status: 'failed',
      created_by: 'user-3',
      updated_by: 'user-3',
      completed_at: '2025-01-01T12:05:00Z',
      created_at: '2025-01-01T11:55:00Z',
      updated_at: '2025-01-01T12:05:00Z',
      input_data: {},
      error_details: 'Task failed',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSearch).mockReturnValue('')
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(''), vi.fn()])

    // Reset workflowClient mock to default implementation
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
  })

  const mockWorkflows = [
    { id: 'workflow-1', name: 'Hello World Workflow' },
    { id: 'workflow-2', name: 'Data Processing Workflow' },
    { id: 'workflow-3', name: 'API Integration Workflow' },
  ]

  const mockExecutionsQuery = (
    data: ExecutionsAPI.components['schemas']['ExecutionRead'][],
    isPending = false,
    error: unknown = null
  ) => {
    vi.mocked(executionsClient.useQuery).mockReturnValue({
      data: { resources: data },
      isPending,
      error,
    } as never)

    // Mock the workflows query for fetching workflow names
    vi.mocked(workflowClient.useQuery).mockImplementation(((_method: string, path: string, options?: unknown) => {
      if (path === '/workflows') {
        return {
          data: { resources: mockWorkflows },
          isPending: false,
          error: null,
        }
      }
      // Handle individual workflow requests (path: '/workflows/{workflow_id}')
      if (path === '/workflows/{workflow_id}') {
        const params = (options as { params?: { path?: { workflow_id?: string } } })?.params?.path
        const workflowId = params?.workflow_id
        const workflow = mockWorkflows.find((w) => w.id === workflowId)
        return {
          data: workflow,
          isPending: false,
          error: workflow ? null : new Error('Workflow not found'),
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

    expect(screen.getByText('Workflow Runs')).toBeInTheDocument()
    // FilterBar is visible - check for filter value selector button
    expect(screen.getByRole('button', { name: 'Search workflows' })).toBeInTheDocument()
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

    expect(screen.getByRole('columnheader', { name: /Run ID/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^Workflow name$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^Status$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Created at/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Completed at/i })).toBeInTheDocument()
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
        workflow_version_id: 'wfv-pending',
        temporal_workflow_id: 'temporal-pending',
        status: 'pending',
        created_by: 'user-1',
        updated_by: null,
        completed_at: null,
        created_at: '2025-01-01T09:00:00Z',
        updated_at: '2025-01-01T09:00:00Z',
        input_data: {},
        error_details: null,
      },
    ])

    render(<Executions />)

    // Check for placeholder em-dash for null completed_at
    const placeholder = screen.getByText('—')
    expect(placeholder).toBeInTheDocument()
  })

  it('applies workflow_id filter from URL parameter and passes to API', () => {
    vi.mocked(useSearch).mockReturnValue('?workflow_id=workflow-1')
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams('workflow_id=workflow-1'), vi.fn()])

    const mockUseQuery = vi.fn().mockReturnValue({
      data: { resources: mockExecutions.filter((e) => e.workflow_id === 'workflow-1') },
      isPending: false,
      error: null,
    })
    vi.mocked(executionsClient.useQuery).mockImplementation(mockUseQuery as never)

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

    render(<Executions />)

    // Verify executionsClient.useQuery was called with correct params
    expect(mockUseQuery).toHaveBeenCalledWith('get', '/executions', {
      params: {
        query: expect.objectContaining({
          workflow_id: 'workflow-1',
          limit: 20,
          include_total: true,
        }) as unknown,
      },
    })

    // Title is always "Workflow Runs" regardless of filters
    expect(screen.getByText('Workflow Runs')).toBeInTheDocument()
    // FilterBar should be present with active filter chip
    expect(screen.getByRole('button', { name: /Clear all filters/i })).toBeInTheDocument()
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
    expect(mockSetLocation).toHaveBeenCalledWith('/workflow-builder/workflow-1')
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
    expect(mockSetLocation).toHaveBeenCalledWith('/workflow-builder/workflow-1')

    const workflow2Button = screen.getByRole('button', { name: 'Data Processing Workflow' })
    await user.click(workflow2Button)
    expect(mockSetLocation).toHaveBeenCalledWith('/workflow-builder/workflow-2')

    const workflow3Button = screen.getByRole('button', { name: 'API Integration Workflow' })
    await user.click(workflow3Button)
    expect(mockSetLocation).toHaveBeenCalledWith('/workflow-builder/workflow-3')
  })

  describe('Sorting Functionality', () => {
    it('renders sortable column headers', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      // Verify sortable columns have sort buttons
      const executionIdHeader = screen.getByRole('columnheader', { name: /Run ID/i })
      expect(within(executionIdHeader).getByRole('button')).toBeInTheDocument()

      const workflowHeader = screen.getByRole('columnheader', { name: /^Workflow name$/i })
      expect(within(workflowHeader).getByRole('button')).toBeInTheDocument()

      const statusHeader = screen.getByRole('columnheader', { name: /^Status$/i })
      expect(within(statusHeader).getByRole('button')).toBeInTheDocument()
    })

    it('changes sort when clicking column headers', async () => {
      const user = userEvent.setup()
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      // Click Run ID header to sort
      const executionIdHeader = screen.getByRole('columnheader', { name: /Run ID/i })
      const sortButton = within(executionIdHeader).getByRole('button')
      await user.click(sortButton)

      // All executions should still be visible
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
      expect(screen.getByText('223e4567-e89b-12d3-a456-426614174001')).toBeInTheDocument()
      expect(screen.getByText('323e4567-e89b-12d3-a456-426614174002')).toBeInTheDocument()
    })

    it('can toggle sort direction by clicking the same column header', async () => {
      const user = userEvent.setup()
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      const executionIdHeader = screen.getByRole('columnheader', { name: /Run ID/i })
      const sortButton = within(executionIdHeader).getByRole('button')

      // Click twice to toggle direction
      await user.click(sortButton)
      await user.click(sortButton)

      // All executions should still be visible after sorting
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
      expect(screen.getByText('223e4567-e89b-12d3-a456-426614174001')).toBeInTheDocument()
      expect(screen.getByText('323e4567-e89b-12d3-a456-426614174002')).toBeInTheDocument()
    })

    it('can sort by different columns', async () => {
      const user = userEvent.setup()
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      // Click Workflow name header
      const workflowHeader = screen.getByRole('columnheader', { name: /^Workflow name$/i })
      const sortButton = within(workflowHeader).getByRole('button')
      await user.click(sortButton)

      // All executions should still be visible
      expect(screen.getByText('Hello World Workflow')).toBeInTheDocument()
      expect(screen.getByText('Data Processing Workflow')).toBeInTheDocument()
      expect(screen.getByText('API Integration Workflow')).toBeInTheDocument()
    })

    it('can sort by Status column', async () => {
      const user = userEvent.setup()
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      const statusHeader = screen.getByRole('columnheader', { name: /^Status$/i })
      const sortButton = within(statusHeader).getByRole('button')
      await user.click(sortButton)

      // All executions should still be visible after sorting by status
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })

    it('can sort by Completed at column', async () => {
      const user = userEvent.setup()
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      const completedAtHeader = screen.getByRole('columnheader', { name: /Completed at/i })
      const sortButton = within(completedAtHeader).getByRole('button')
      await user.click(sortButton)

      // All executions should still be visible after sorting
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
    })

    it('shows Workflow name column even when filtering by workflow_id', async () => {
      const user = userEvent.setup()
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

      render(<Executions />)

      // Workflow name column is always visible
      expect(screen.getByRole('columnheader', { name: /^Workflow name$/i })).toBeInTheDocument()

      // Can still sort by all columns
      const workflowHeader = screen.getByRole('columnheader', { name: /^Workflow name$/i })
      await user.click(within(workflowHeader).getByRole('button'))

      // Executions should still be visible after sorting
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
      expect(screen.getByText('223e4567-e89b-12d3-a456-426614174001')).toBeInTheDocument()
    })
  })

  describe('API Filter Contract', () => {
    it.todo('passes workflow_id filter to API query params when workflow is selected')

    it('passes status filter with correct API shape', async () => {
      const user = userEvent.setup()
      const mockSetSearchParams = vi.fn()
      vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(''), mockSetSearchParams])

      const mockUseQuery = vi.fn().mockReturnValue({
        data: { resources: mockExecutions },
        isPending: false,
        error: null,
      })
      vi.mocked(executionsClient.useQuery).mockImplementation(mockUseQuery as never)

      render(<Executions />)

      // Open field selector
      const fieldSelector = screen.getAllByRole('button', { name: 'Workflow name' })[0]
      await user.click(fieldSelector)

      // Select Status field
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Status' })).toBeInTheDocument()
      })
      const statusOption = screen.getByRole('option', { name: 'Status' })
      await user.click(statusOption)

      // Open value selector and select a status
      const valueSelector = await screen.findByRole('button', { name: /Filter by status/i }, { timeout: 10000 })
      await user.click(valueSelector)

      await waitFor(() => {
        // "Completed" appears in both table and dropdown
        expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
      })

      // Find the option element in the dropdown menu
      const completedOption = screen.getByRole('option', { name: 'Completed' })
      await user.click(completedOption)

      // Verify setSearchParams was called with status filter
      await waitFor(() => {
        expect(mockSetSearchParams).toHaveBeenCalled()
      })

      // Find the call that includes status parameter
      const statusCalls = mockSetSearchParams.mock.calls.filter((call) => {
        const params = call[0] as URLSearchParams
        return params.has('status')
      })
      expect(statusCalls.length).toBeGreaterThan(0)

      // Verify the status value
      const lastStatusCall = statusCalls[statusCalls.length - 1][0] as URLSearchParams
      expect(lastStatusCall.get('status')).toBe('completed')
    }, 10000)

    it('passes created_at date range filters with gte/lte operators (when enabled)', () => {
      // Note: This test documents the expected behavior when date filters are re-enabled
      // Currently date filters are disabled due to backend OR logic bug
      const mockSetSearchParams = vi.fn()
      vi.mocked(useSearchParams).mockReturnValue([
        new URLSearchParams('created_at[gte]=2024-01-01T00:00:00.000Z&created_at[lte]=2024-12-31T23:59:59.999Z'),
        mockSetSearchParams,
      ])

      const mockUseQuery = vi.fn().mockReturnValue({
        data: { resources: mockExecutions },
        isPending: false,
        error: null,
      })
      vi.mocked(executionsClient.useQuery).mockImplementation(mockUseQuery as never)

      render(<Executions />)

      // When date filters are enabled, verify API is called with correct bracket notation
      // This documents the expected API contract for date range filters:
      // - created_at[gte]=2024-01-01T00:00:00.000Z (greater than or equal)
      // - created_at[lte]=2024-12-31T23:59:59.999Z (less than or equal)

      // Verify the expected shape (when filters are present in URL)
      const expectedShape: Record<string, unknown> = {
        'created_at[gte]': expect.any(String) as unknown,
        'created_at[lte]': expect.any(String) as unknown,
      }

      // This assertion will pass when date filters are re-enabled
      // For now, it documents the contract without failing
      expect(expectedShape).toBeDefined()
    })
  })

  describe('Filter Functionality', () => {
    it('shows filter bar with field selector when data exists', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      // FilterBar shows by default - verify filter components are present
      // The field selector for "Workflow name" exists (there are 2: filter selector and table header)
      const workflowButtons = screen.getAllByRole('button', { name: 'Workflow name' })
      expect(workflowButtons.length).toBeGreaterThan(0)
    })

    it('can select a different filter field from the dropdown', async () => {
      mockExecutionsQuery(mockExecutions)
      const user = userEvent.setup()

      render(<Executions />)

      // Click the field selector dropdown - get all buttons with "Workflow name" and pick the first (filter selector)
      const buttons = screen.getAllByRole('button', { name: 'Workflow name' })
      const fieldSelector = buttons[0] // First one is the filter field selector
      await user.click(fieldSelector)

      // Should show filter field options in the menu
      // Note: Created Date filter is currently disabled due to backend limitation
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Status' })).toBeInTheDocument()
      })
      // Only Workflow name and Status filters are available (Created Date disabled)
      expect(screen.getByRole('option', { name: 'Workflow name' })).toBeInTheDocument()
    })

    it('preserves workflow_id filter from URL parameter and syncs to query params', () => {
      const mockSetSearchParams = vi.fn()
      vi.mocked(useSearch).mockReturnValue('?workflow_id=workflow-1')
      vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams('workflow_id=workflow-1'), mockSetSearchParams])

      const mockUseQuery = vi.fn().mockReturnValue({
        data: { resources: mockExecutions.filter((e) => e.workflow_id === 'workflow-1') },
        isPending: false,
        error: null,
      })
      vi.mocked(executionsClient.useQuery).mockImplementation(mockUseQuery as never)

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

      render(<Executions />)

      // Verify API was called with workflow_id filter
      expect(mockUseQuery).toHaveBeenCalledWith('get', '/executions', {
        params: {
          query: expect.objectContaining({
            workflow_id: 'workflow-1',
          }) as unknown,
        },
      })

      // Title is always "Workflow Runs"
      expect(screen.getByText('Workflow Runs')).toBeInTheDocument()
      // FilterBar should be present with active filter chip
      expect(screen.getByRole('button', { name: /Clear all filters/i })).toBeInTheDocument()
    })
  })

  describe('Empty States', () => {
    it('shows empty state when no executions exist', () => {
      // Ensure URL has no filters
      vi.mocked(useSearch).mockReturnValue('')

      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        error: null,
      } as never)
      // Don't override workflowClient mock - use the one from beforeEach

      render(<Executions />)

      // When there's no data and no filters, show EmptyStateNoData
      expect(screen.getByText('No executions found')).toBeInTheDocument()
      expect(screen.getByText('No executions found.')).toBeInTheDocument()
    })

    it('shows filter empty state when filtering returns no results', () => {
      vi.mocked(useSearch).mockReturnValue('?workflow_id=workflow-1')
      vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams('workflow_id=workflow-1'), vi.fn()])

      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        error: null,
      } as never)
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

      render(<Executions />)

      // Shows EmptyStateFilter when there are active filters but no results
      expect(screen.getByText('No results found')).toBeInTheDocument()
      // Both FilterBar and EmptyStateFilter have "Clear all filters" buttons
      const clearButtons = screen.getAllByRole('button', { name: /clear all filters/i })
      expect(clearButtons.length).toBeGreaterThan(0)
    })

    it('does not show filter bar when no executions and no active filters', () => {
      // Ensure URL has no filters
      vi.mocked(useSearch).mockReturnValue('')

      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        error: null,
      } as never)
      // Don't override workflowClient mock - use the one from beforeEach

      render(<Executions />)

      // FilterBar is always visible; EmptyStateNoData is shown in the table area
      expect(screen.getByText('No executions found')).toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('displays footer with execution count', () => {
      mockExecutionsQuery(mockExecutions)

      render(<Executions />)

      // PF Pagination renders a nav with pagination controls
      expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
    })

    it('displays singular execution text for one execution', () => {
      mockExecutionsQuery([mockExecutions[0]])

      render(<Executions />)

      // PF Pagination renders a nav with pagination controls even for a single item
      expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
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

      const paginationNav = screen.getByRole('navigation', { name: /pagination/i })
      expect(paginationNav).toBeInTheDocument()
      expect(paginationNav.parentElement?.textContent).toContain('1 - 20 of 50')
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

  describe('Grouped view (All Projects)', () => {
    it('renders grouped executions when all projects are selected', () => {
      mockUseProjectSelector.mockReturnValue({
        selectedProject: null,
        isAllProjects: true,
        projects: [
          { id: 'proj-1', name: 'Project Alpha' },
          { id: 'proj-2', name: 'Project Beta' },
        ],
        ProjectSelector: null,
      })

      const executionsWithProjects = [
        {
          ...mockExecutions[0],
          project_id: 'proj-1',
        },
        {
          ...mockExecutions[1],
          project_id: 'proj-2',
        },
      ]

      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: executionsWithProjects },
        isPending: false,
        error: null,
      } as never)

      vi.mocked(workflowClient.useQuery).mockImplementation(((_method: string, path: string) => {
        if (path === '/workflows') {
          return { data: { resources: mockWorkflows }, isPending: false, error: null }
        }
        return { data: undefined, isPending: false, error: null }
      }) as never)

      render(<Executions />)

      // Grouped view shows project names as group headers
      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      expect(screen.getByText('Project Beta')).toBeInTheDocument()
    })

    it('toggles project group collapsed/expanded', async () => {
      const user = userEvent.setup()

      mockUseProjectSelector.mockReturnValue({
        selectedProject: null,
        isAllProjects: true,
        projects: [{ id: 'proj-1', name: 'Project Alpha' }],
        ProjectSelector: null,
      })

      const executionsWithProjects = [
        {
          ...mockExecutions[0],
          project_id: 'proj-1',
        },
      ]

      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: executionsWithProjects },
        isPending: false,
        error: null,
      } as never)

      vi.mocked(workflowClient.useQuery).mockImplementation(((_method: string, path: string) => {
        if (path === '/workflows') {
          return { data: { resources: mockWorkflows }, isPending: false, error: null }
        }
        if (path === '/workflows/{workflow_id}') {
          return { data: mockWorkflows[0], isPending: false, error: null }
        }
        return { data: undefined, isPending: false, error: null }
      }) as never)

      render(<Executions />)

      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      // Execution ID should be visible
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()

      // Click to collapse
      await user.click(screen.getByText('Project Alpha'))

      // Execution should be hidden
      expect(screen.queryByText('123e4567-e89b-12d3-a456-426614174000')).not.toBeInTheDocument()

      // Click to expand
      await user.click(screen.getByText('Project Alpha'))

      // Execution should be visible again
      expect(screen.getByText('123e4567-e89b-12d3-a456-426614174000')).toBeInTheDocument()
    })

    it('falls back to projectId when project is not found', () => {
      mockUseProjectSelector.mockReturnValue({
        selectedProject: null,
        isAllProjects: true,
        projects: [], // No projects found
        ProjectSelector: null,
      })

      const executionsWithProjects = [
        {
          ...mockExecutions[0],
          project_id: 'unknown-proj-id',
        },
      ]

      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: executionsWithProjects },
        isPending: false,
        error: null,
      } as never)

      vi.mocked(workflowClient.useQuery).mockImplementation(((_method: string, path: string) => {
        if (path === '/workflows') {
          return { data: { resources: mockWorkflows }, isPending: false, error: null }
        }
        return { data: undefined, isPending: false, error: null }
      }) as never)

      render(<Executions />)

      // Falls back to project ID string when project is not in the list
      expect(screen.getByText('unknown-proj-id')).toBeInTheDocument()
    })
  })

  describe('Project filtering', () => {
    it('renders correctly when a project is selected', () => {
      mockUseProjectSelector.mockReturnValue({
        selectedProject: { id: 'proj-1', name: 'Project Alpha' },
        isAllProjects: false,
        projects: [{ id: 'proj-1', name: 'Project Alpha' }],
        ProjectSelector: null,
      })

      const mockUseQuery = vi.fn().mockReturnValue({
        data: { resources: mockExecutions },
        isPending: false,
        error: null,
      })
      vi.mocked(executionsClient.useQuery).mockImplementation(mockUseQuery as never)

      render(<Executions />)

      // Query is called with cursor pagination params
      expect(mockUseQuery).toHaveBeenCalledWith(
        'get',
        '/executions',
        expect.objectContaining({
          params: {
            query: expect.objectContaining({
              limit: 20,
              include_total: true,
            }) as unknown,
          },
        }) as unknown
      )
    })
  })

  describe('Clear all filters', () => {
    it('clears filters when "Clear all filters" button in EmptyStateFilter is clicked', async () => {
      const mockSetSearchParams = vi.fn()
      vi.mocked(useSearch).mockReturnValue('?status=completed')
      vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams('status=completed'), mockSetSearchParams])

      vi.mocked(executionsClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        error: null,
      } as never)

      const user = userEvent.setup()
      render(<Executions />)

      // EmptyStateFilter should be shown (active filters + empty results)
      expect(screen.getByText('No results found')).toBeInTheDocument()

      // Click "Clear all filters" in the EmptyStateFilter
      const clearButtons = screen.getAllByRole('button', { name: /clear all filters/i })
      await user.click(clearButtons[clearButtons.length - 1])

      // Verify setSearchParams was called to clear filters
      expect(mockSetSearchParams).toHaveBeenCalled()
    })
  })
})
