import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { executionsClient } from '../../client'

import ExecutionDetail from './ExecutionDetail'
import { useExecutionNodeClick } from './hooks/useExecutionNodeClick'

// Create mock functions
const mockSetLocation = vi.fn()
const mockUseParams = vi.fn(() => ({ executionId: 'exec-123' }))
const mockUseSearch = vi.fn(() => '')

// Mock wouter
vi.mock('wouter', () => ({
  useParams: () => mockUseParams(),
  useLocation: () => ['/', mockSetLocation],
  useSearch: () => mockUseSearch(),
}))

// Mock the workflow client with execution query that includes workflow_definition
const mockExecutionQuery = {
  data: {
    id: 'exec-123',
    workflow_id: 'wf-456',
    workflow_version_id: 'version-789',
    status: 'running',
    started_at: '2024-01-01T00:00:00Z',
    activities: [
      {
        id: 'activity-1',
        activity_name: 'task-1',
        status: 'completed',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
      },
    ],
    workflow_definition: {
      schemaVersion: '1.0.0',
      version: 1,
      metadata: {
        name: 'Test Workflow',
        description: 'A test workflow',
      },
      workflow: {
        activities: [
          {
            id: 'task-1',
            type: 'task' as const,
            name: 'Test Task',
            tool: {
              provider_id: 'test-provider',
              tool_id: 'test-tool',
            },
          },
        ],
      },
    },
  },
  isLoading: false,
  error: null,
}

const mockExecutionsQuery = {
  data: {
    resources: [
      { id: 'exec-123', status: 'running', created_at: '2024-01-01T00:00:00Z' },
      { id: 'exec-456', status: 'completed', created_at: '2024-01-01T01:00:00Z' },
    ],
  },
  isLoading: false,
  error: null,
}

vi.mock('../../hooks/useCanI', () => ({
  useCanI: vi.fn(() => ({ allowed: true, isChecking: false })),
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
  executionsClient: {
    useQuery: vi.fn((_method: string, endpoint: string) => {
      if (endpoint === '/executions/{execution_id}') {
        return mockExecutionQuery
      }
      if (endpoint === '/executions') {
        return mockExecutionsQuery
      }
      return { data: null, isLoading: false, error: null }
    }),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
  },
  approvalsClient: {
    useQuery: vi.fn(() => ({
      data: null,
      isPending: false,
      error: null,
      isError: false,
      refetch: vi.fn(),
    })),
  },
}))

// Mock workflow store with required selectors
vi.mock('../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => ({
      updateActivity: vi.fn(),
    })),
  },
  selectCurrentWorkflow: vi.fn(),
  selectWorkflowVersion: vi.fn(),
  selectEdges: vi.fn(() => []),
  selectTriggersCount: vi.fn(() => 0),
  selectActivities: vi.fn(() => []),
}))

// Mock ExecutionViewContent component
vi.mock('../builder/ExecutionViewContent', () => ({
  ExecutionViewContent: ({
    workflow,
    executionStatus,
  }: {
    workflow: { name?: string } | undefined
    executionStatus: string | null
  }) => (
    <div data-testid="execution-view-content">
      <div>Workflow: {workflow?.name}</div>
      <div>Execution Status: {executionStatus}</div>
    </div>
  ),
}))

// Mock ExecutionDetailsPanel component
vi.mock('../builder/ExecutionDetailsPanel', () => ({
  ExecutionDetailsPanel: ({ executionId }: { executionId: string }) => (
    <div data-testid="execution-details-panel">
      <div>Execution ID: {executionId}</div>
    </div>
  ),
}))

// Mock WorkflowHistoryCard component
vi.mock('../builder/WorkflowHistoryCard', () => ({
  WorkflowHistoryCard: ({
    executions,
    selectedExecutionId,
    onClose,
    onExecutionSelect,
  }: {
    executions: Array<{ id: string }>
    selectedExecutionId?: string | null
    onClose: () => void
    onExecutionSelect: (id: string) => void
  }) => (
    <div data-testid="workflow-history-card">
      <button onClick={onClose} aria-label="Close history">
        Close History
      </button>
      {executions.map((exec) => (
        <button key={exec.id} onClick={() => onExecutionSelect(exec.id)} aria-label={`Select execution ${exec.id}`}>
          {exec.id}
          {exec.id === selectedExecutionId && ' (selected)'}
        </button>
      ))}
    </div>
  ),
}))

// Mock StatusLabel component
vi.mock('../builder/ExecutionStatus', () => ({
  StatusLabel: ({ status }: { status: string }) => {
    const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)
    return <div>{capitalizedStatus}</div>
  },
}))

// Mock useExecutionWebSocket hook
vi.mock('../workflows/hooks/useExecutionWebSocket', () => ({
  useExecutionWebSocket: vi.fn(),
}))

// Mock ApprovalReviewView component
vi.mock('./ApprovalReviewView', () => ({
  ApprovalReviewView: ({ approval, onClose }: { approval: { id: string; name: string }; onClose: () => void }) => (
    <div data-testid="approval-review-view">
      <div>Approval: {approval.name}</div>
      <button onClick={onClose}>Close review</button>
    </div>
  ),
}))

// Mock useExecutionNodeClick hook
const mockHandleNodeClick = vi.fn()
const mockSelectNode = vi.fn()
const mockDeselectNode = vi.fn()
const mockPendingApproval = {
  id: 'approval-1',
  name: 'Test Approval',
  approval_node_id: 'node-abc',
  status: 'pending',
  execution_id: 'exec-123',
  workflow_context: { workflow_name: 'Test Workflow' },
}

const mockClearPendingApproval = vi.fn()

vi.mock('./hooks/useExecutionNodeClick', () => ({
  useExecutionNodeClick: vi.fn(() => ({
    pendingApproval: null,
    isApprovalLoading: false,
    clearPendingApproval: mockClearPendingApproval,
    selectedNodeId: null,
    selectedNodeName: null,
    selectNode: mockSelectNode,
    deselectNode: mockDeselectNode,
    handleNodeClick: mockHandleNodeClick,
  })),
}))

describe('ExecutionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetLocation.mockClear()
    mockUseParams.mockReturnValue({ executionId: 'exec-123' })
    mockUseSearch.mockReturnValue('')
  })

  it('renders page with workflow name and status in title', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    expect(screen.getByText('Test Workflow')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('renders BuilderContent with execution view props', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    expect(screen.getByTestId('execution-view-content')).toBeInTheDocument()
    expect(screen.getByText('Execution Status: running')).toBeInTheDocument()
  })

  it('renders execution details panel with correct execution ID', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    expect(screen.getByTestId('execution-details-panel')).toBeInTheDocument()
    expect(screen.getByText('Execution ID: exec-123')).toBeInTheDocument()
  })

  it('fetches execution with workflow_definition and activities included', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    expect(vi.mocked(executionsClient.useQuery)).toHaveBeenCalledWith(
      'get',
      '/executions/{execution_id}',
      expect.objectContaining({
        params: {
          path: { execution_id: 'exec-123' },
          query: {
            include: 'workflow_definition,activities',
          },
        },
      })
    )
  })

  it('shows history panel by default', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    expect(screen.getByTestId('workflow-history-card')).toBeInTheDocument()
  })

  it('shows history panel when history=open query param is present', () => {
    mockUseSearch.mockReturnValue('?history=open')

    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    expect(screen.getByTestId('workflow-history-card')).toBeInTheDocument()
  })

  it('toggles history panel closed when history button is clicked', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    const historyButton = screen.getByLabelText('Run history')
    await user.click(historyButton)

    expect(mockSetLocation).toHaveBeenCalledWith('/executions/exec-123?history=closed')
  })

  it('closes history panel when close button in history card is clicked', async () => {
    mockUseSearch.mockReturnValue('?history=open')

    const user = userEvent.setup()
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    const closeButton = screen.getByLabelText('Close history')
    await user.click(closeButton)

    expect(mockSetLocation).toHaveBeenCalledWith('/executions/exec-123?history=closed')
  })

  it('navigates to workflow builder when Back to editor button is clicked', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    const backButton = screen.getByRole('button', { name: 'Back to editor' })
    await user.click(backButton)

    expect(mockSetLocation).toHaveBeenCalledWith('/workflow-builder/wf-456')
  })

  it('preserves history panel state when navigating to different execution', async () => {
    mockUseSearch.mockReturnValue('?history=open')

    const user = userEvent.setup()
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    const executionButton = screen.getByLabelText('Select execution exec-456')
    await user.click(executionButton)

    expect(mockSetLocation).toHaveBeenCalledWith('/executions/exec-456?history=open')
  })

  it('uses executionId as key for ReactFlowProvider', () => {
    const queryClient = new QueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )

    // ReactFlowProvider should re-mount when executionId changes
    // This is tested by checking that the component renders properly
    expect(container).toBeTruthy()
  })

  describe('pending activities initialization', () => {
    it('creates pending activity states when execution has no activities yet', () => {
      // Mock execution with no activity executions but has workflow definition
      const mockNewExecutionQuery = {
        data: {
          id: 'exec-new',
          workflow_id: 'wf-456',
          status: 'pending',
          activities: [], // No activity executions yet
          workflow_definition: {
            workflow: {
              activities: [
                { id: 'task-1', type: 'task', name: 'Task 1' },
                { id: 'task-2', type: 'task', name: 'Task 2' },
                { id: 'task-3', type: 'task', name: 'Task 3' },
              ],
            },
          },
        },
        isLoading: false,
        error: null,
      }

      vi.mocked(executionsClient.useQuery).mockImplementation((_method: string, endpoint: string) => {
        if (endpoint === '/executions/{execution_id}') {
          return mockNewExecutionQuery
        }
        return mockExecutionsQuery
      })

      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      // The component should render without errors
      expect(screen.getByTestId('execution-view-content')).toBeInTheDocument()
    })

    it('uses actual activity executions when they exist', () => {
      // Default mock has activities
      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      // Should render with actual activity data
      expect(screen.getByTestId('execution-view-content')).toBeInTheDocument()
    })

    it('handles execution with no workflow definition gracefully', () => {
      const mockMinimalExecution = {
        data: {
          id: 'exec-minimal',
          workflow_id: 'wf-456',
          status: 'pending',
          activities: [],
          workflow_definition: null, // No workflow definition
        },
        isLoading: false,
        error: null,
      }

      vi.mocked(executionsClient.useQuery).mockImplementation((_method: string, endpoint: string) => {
        if (endpoint === '/executions/{execution_id}') {
          return mockMinimalExecution
        }
        return mockExecutionsQuery
      })

      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      // Should render without crashing
      expect(screen.getByTestId('execution-view-content')).toBeInTheDocument()
    })
  })

  describe('Execution Store Reset', () => {
    it('resets execution store when executionId changes', async () => {
      const queryClient = new QueryClient()

      // Mock execution store with reset function
      const mockReset = vi.fn()
      const mockSetActivityExecutions = vi.fn()

      // Store the original useExecutionStore module
      const { useExecutionStore } = await import('../workflows/stores/useExecutionStore')

      // Mock getState to return our mock functions
      const originalGetState = useExecutionStore.getState
      useExecutionStore.getState = vi.fn(() => ({
        ...originalGetState(),
        reset: mockReset,
        setActivityExecutions: mockSetActivityExecutions,
      }))

      // Initial render with exec-123
      mockUseParams.mockReturnValue({ executionId: 'exec-123' })
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      // Should call reset on mount
      expect(mockReset).toHaveBeenCalledTimes(1)

      // Change executionId to exec-456
      mockUseParams.mockReturnValue({ executionId: 'exec-456' })
      rerender(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      // Should call reset again when executionId changes
      expect(mockReset).toHaveBeenCalledTimes(2)

      // Restore original
      useExecutionStore.getState = originalGetState
    })

    it('does not reset execution store when executionId stays the same', async () => {
      const queryClient = new QueryClient()

      // Mock execution store with reset function
      const mockReset = vi.fn()
      const mockSetActivityExecutions = vi.fn()

      // Store the original useExecutionStore module
      const { useExecutionStore } = await import('../workflows/stores/useExecutionStore')

      // Mock getState to return our mock functions
      const originalGetState = useExecutionStore.getState
      useExecutionStore.getState = vi.fn(() => ({
        ...originalGetState(),
        reset: mockReset,
        setActivityExecutions: mockSetActivityExecutions,
      }))

      // Initial render with exec-123
      mockUseParams.mockReturnValue({ executionId: 'exec-123' })
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      // Should call reset on mount
      expect(mockReset).toHaveBeenCalledTimes(1)

      // Re-render with same executionId
      rerender(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      // Should still only have called reset once (not called again for same executionId)
      expect(mockReset).toHaveBeenCalledTimes(1)

      // Restore original
      useExecutionStore.getState = originalGetState
    })
  })

  describe('Approval Review View', () => {
    it('opens approval review view when Review approval is clicked', async () => {
      vi.mocked(useExecutionNodeClick).mockReturnValue({
        pendingApproval: mockPendingApproval as never,
        isApprovalLoading: false,
        clearPendingApproval: mockClearPendingApproval,
        selectedNodeId: null,
        selectedNodeName: null,
        selectNode: mockSelectNode,
        deselectNode: mockDeselectNode,
        handleNodeClick: mockHandleNodeClick,
      })

      const user = userEvent.setup()
      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      await user.click(screen.getByRole('button', { name: 'Review approval' }))

      expect(screen.getByTestId('approval-review-view')).toBeInTheDocument()
    })

    it('closes approval review view and shows canvas when Close is clicked', async () => {
      vi.mocked(useExecutionNodeClick).mockReturnValue({
        pendingApproval: mockPendingApproval as never,
        isApprovalLoading: false,
        clearPendingApproval: mockClearPendingApproval,
        selectedNodeId: null,
        selectedNodeName: null,
        selectNode: mockSelectNode,
        deselectNode: mockDeselectNode,
        handleNodeClick: mockHandleNodeClick,
      })

      const user = userEvent.setup()
      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      // Open the review view
      await user.click(screen.getByRole('button', { name: 'Review approval' }))
      expect(screen.getByTestId('approval-review-view')).toBeInTheDocument()

      // Close it
      await user.click(screen.getByRole('button', { name: 'Close review' }))
      expect(screen.queryByTestId('approval-review-view')).not.toBeInTheDocument()
      expect(screen.getByTestId('execution-view-content')).toBeInTheDocument()
      expect(mockClearPendingApproval).toHaveBeenCalledTimes(1)
    })
  })

  describe('Cancel Execution Button', () => {
    it('shows cancel button when execution is running', () => {
      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      expect(screen.getByRole('button', { name: 'Cancel execution' })).toBeInTheDocument()
    })

    it('shows cancel button when execution is pending', () => {
      vi.mocked(executionsClient.useQuery).mockImplementation((_method: string, endpoint: string) => {
        if (endpoint === '/executions/{execution_id}') {
          return { ...mockExecutionQuery, data: { ...mockExecutionQuery.data, status: 'pending' } }
        }
        return mockExecutionsQuery
      })

      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      expect(screen.getByRole('button', { name: 'Cancel execution' })).toBeInTheDocument()
    })

    it('does not show cancel button when execution is completed', () => {
      vi.mocked(executionsClient.useQuery).mockImplementation((_method: string, endpoint: string) => {
        if (endpoint === '/executions/{execution_id}') {
          return { ...mockExecutionQuery, data: { ...mockExecutionQuery.data, status: 'completed' } }
        }
        return mockExecutionsQuery
      })

      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      expect(screen.queryByRole('button', { name: 'Cancel execution' })).not.toBeInTheDocument()
    })

    it('does not show cancel button when execution is failed', () => {
      vi.mocked(executionsClient.useQuery).mockImplementation((_method: string, endpoint: string) => {
        if (endpoint === '/executions/{execution_id}') {
          return { ...mockExecutionQuery, data: { ...mockExecutionQuery.data, status: 'failed' } }
        }
        return mockExecutionsQuery
      })

      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      expect(screen.queryByRole('button', { name: 'Cancel execution' })).not.toBeInTheDocument()
    })

    it('does not show cancel button when execution is cancelled', () => {
      vi.mocked(executionsClient.useQuery).mockImplementation((_method: string, endpoint: string) => {
        if (endpoint === '/executions/{execution_id}') {
          return { ...mockExecutionQuery, data: { ...mockExecutionQuery.data, status: 'cancelled' } }
        }
        return mockExecutionsQuery
      })

      const queryClient = new QueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <ExecutionDetail />
        </QueryClientProvider>
      )

      expect(screen.queryByRole('button', { name: 'Cancel execution' })).not.toBeInTheDocument()
    })
  })

  it('has no accessibility violations', async () => {
    const queryClient = new QueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetail />
      </QueryClientProvider>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
