import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useSearch } from 'wouter'

import { workflowClient } from '../../client'

import Executions from './Executions'

// Mock the workflowClient
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
  },
}))

// Mock wouter
vi.mock('wouter', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    useLocation: () => ['/executions', vi.fn()],
    useSearch: vi.fn(() => ''),
  }
})

describe('Executions Component', () => {
  const mockExecutions: WorkflowAPI.components['schemas']['Execution'][] = [
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

  const mockExecutionsQuery = (
    data: WorkflowAPI.components['schemas']['Execution'][],
    isPending = false,
    error = null
  ) => {
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: { resources: data },
      isPending,
      error,
    } as never)
  }

  it('renders the executions table with data', () => {
    mockExecutionsQuery(mockExecutions)

    render(<Executions />)

    expect(screen.getByText('Run history')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search executions...')).toBeInTheDocument()
  })

  it('displays execution IDs', () => {
    mockExecutionsQuery(mockExecutions)

    render(<Executions />)

    // Check for truncated IDs
    expect(screen.getByText('123e4567...')).toBeInTheDocument()
    expect(screen.getByText('223e4567...')).toBeInTheDocument()
    expect(screen.getByText('323e4567...')).toBeInTheDocument()
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

    expect(screen.getByText('Execution ID')).toBeInTheDocument()
    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Created At')).toBeInTheDocument()
    expect(screen.getByText('Completed At')).toBeInTheDocument()
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

  it('displays workflow links', () => {
    mockExecutionsQuery(mockExecutions)

    render(<Executions />)

    // Check for truncated workflow IDs - "workflow-1" becomes "workflow-..."
    const workflowLinks = screen.getAllByText(/workflow.../)
    expect(workflowLinks.length).toBeGreaterThan(0)
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

    let callIndex = 0
    vi.mocked(workflowClient.useQuery).mockImplementation(((endpoint: string, path: string) => {
      callIndex++
      if (path === '/executions' || callIndex === 1) {
        // First call is for executions
        return {
          data: { resources: mockExecutions.filter((e) => e.workflow_id === 'workflow-1') },
          isPending: false,
          error: null,
        } as never
      } else {
        // Second call is for workflow
        return {
          data: { id: 'workflow-1', name: 'My Test Workflow' },
          isPending: false,
          error: null,
        } as never
      }
    }) as never)

    render(<Executions />)

    expect(screen.getByText('Run history for My Test Workflow')).toBeInTheDocument()
  })
})
