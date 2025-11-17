import type { WorkflowWithVersion } from '@ansible/nexus-contracts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Node } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'

import { workflowClient } from '../../client'

import Automation, { AutomationSidepanel } from './Automation'
import * as useSelectedNodeModule from './canvas/nodes/common/useSelectedNode'

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

// Mocking external dependencies
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
    })),
  },
}))

const mockRefetch = vi.fn()

// Mock Wouter's useParams and useLocation
vi.mock('wouter', () => ({
  useParams: () => ({ workflowId: '1' }),
  useLocation: () => ['/', vi.fn()],
  useSearch: () => '',
}))

// Mock useAlerts
vi.mock('@ansible/nexus-ui-framework', async () => {
  const actual = await vi.importActual('@ansible/nexus-ui-framework')
  return {
    ...actual,
    useAlerts: () => ({
      showSuccess: vi.fn(),
      showError: vi.fn(),
    }),
  }
})

// Sample workflow data for testing
const mockWorkflow = {
  id: '1',
  name: 'Test Workflow',
  current_version: 1,
  is_enabled: true,
  labels: { category: 'test' },
  created_by: 'user1',
  created_at: '2024-01-01T00:00:00Z',
  version: {
    version: 1,
    schema_version: '1.0.0',
    workflow_definition: {
      schemaVersion: '1.0.0',
      version: 1,
      metadata: {
        name: 'Test Workflow',
        description: 'A test workflow for automation',
        owner: 'user1',
        tags: ['test'],
        timeout: 'PT1H',
      },
      triggers: [
        {
          type: 'manual' as const,
          requiresApproval: false,
        },
      ],
      workflow: {
        activities: [
          {
            type: 'task',
            task: {
              executor: 'script',
              config: {
                language: 'python',
                code: 'print("Hello, World!")',
              },
            },
            id: 'task1',
            name: 'First Task',
          },
          {
            type: 'condition',
            condition: '${input.value > 10}',
            then: [
              {
                type: 'task',
                task: {
                  executor: 'script',
                  config: {
                    language: 'python',
                    code: 'print("High value detected")',
                  },
                },
                id: 'task2',
                name: 'High Value Task',
              },
            ],
            else: [
              {
                type: 'task',
                task: {
                  executor: 'script',
                  config: {
                    language: 'python',
                    code: 'print("Low value detected")',
                  },
                },
                id: 'task3',
                name: 'Low Value Task',
              },
            ],
          },
        ],
      },
    },
    created_by: 'user1',
    created_at: '2024-01-01T00:00:00Z',
    change_description: 'Initial workflow version',
  },
} as WorkflowWithVersion

describe('Automation Component', () => {
  it('renders workflow details when data is loaded', () => {
    // Mock successful data fetch
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: mockWorkflow,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })

    const { container } = render(<Automation />)

    // Check page header with workflow name
    expect(screen.getByText('Test Workflow')).toBeInTheDocument()

    // Check ReactFlow components are rendered (by container or specific classes)
    const reactFlow = container.querySelector('.react-flow')
    expect(reactFlow).toBeInTheDocument()
  })

  it('renders error state when workflow fetch fails', () => {
    // Mock error state
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to load workflow'),
      refetch: mockRefetch,
    })

    render(<Automation />)

    // Verify error state is rendered
    expect(screen.getByText('Error loading workflow')).toBeInTheDocument()
  })

  it('does not render workflow details panel by default', () => {
    // Mock successful data fetch
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: mockWorkflow,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })

    render(<Automation />)

    // Workflow details panel should not be visible
    expect(screen.queryByText('Workflow Details')).not.toBeInTheDocument()
  })

  it('does not render history panel by default', () => {
    // Mock successful data fetch
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: mockWorkflow,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })

    render(<Automation />)

    // History panel should not be visible
    expect(screen.queryByText('Run History')).not.toBeInTheDocument()
  })

  it('toggles workflow details panel when details button is clicked', async () => {
    // Mock successful data fetch
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: mockWorkflow,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })

    const user = userEvent.setup()
    render(<Automation />)

    // Panel should not be visible initially
    expect(screen.queryByText('Workflow Details')).not.toBeInTheDocument()

    // Find and click the details button (FileCode icon button)
    const buttons = screen.getAllByRole('button')
    const detailsButton = buttons.find((btn) => btn.querySelector('svg.lucide-file-code'))
    expect(detailsButton).toBeTruthy()

    await user.click(detailsButton!)

    // Panel should now be visible
    expect(screen.getByText('Workflow Details')).toBeInTheDocument()

    // Click again to close
    await user.click(detailsButton!)

    // Panel should be hidden again
    expect(screen.queryByText('Workflow Details')).not.toBeInTheDocument()
  })

  it('toggles history panel when history button is clicked', async () => {
    // Mock successful data fetch
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: mockWorkflow,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })

    const user = userEvent.setup()
    render(<Automation />)

    // Panel should not be visible initially
    expect(screen.queryByText('Run History')).not.toBeInTheDocument()

    // Find and click the history button (Clock icon button)
    const buttons = screen.getAllByRole('button')
    const historyButton = buttons.find((btn) => btn.querySelector('svg.lucide-clock'))
    expect(historyButton).toBeTruthy()

    await user.click(historyButton!)

    // Panel should now be visible
    expect(screen.getByText('Run History')).toBeInTheDocument()

    // Click again to close
    await user.click(historyButton!)

    // Panel should be hidden again
    expect(screen.queryByText('Run History')).not.toBeInTheDocument()
  })

  it('closes workflow details panel when close button is clicked', async () => {
    // Mock successful data fetch
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: mockWorkflow,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })

    const user = userEvent.setup()
    render(<Automation />)

    // Open the details panel
    const buttons = screen.getAllByRole('button')
    const detailsButton = buttons.find((btn) => btn.querySelector('svg.lucide-file-code'))
    await user.click(detailsButton!)

    // Panel should be visible
    expect(screen.getByText('Workflow Details')).toBeInTheDocument()

    // Find and click the close button (X icon) in the panel
    const closeButtons = screen.getAllByRole('button')
    const panelCloseButton = closeButtons.find((btn) => btn.querySelector('svg.lucide-x') && btn.closest('.glass'))
    expect(panelCloseButton).toBeTruthy()

    await user.click(panelCloseButton!)

    // Panel should be hidden
    expect(screen.queryByText('Workflow Details')).not.toBeInTheDocument()
  })

  it('closes history panel when close button is clicked', async () => {
    // Mock successful data fetch
    vi.mocked(workflowClient.useQuery).mockReturnValue({
      data: mockWorkflow,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    })

    const user = userEvent.setup()
    render(<Automation />)

    // Open the history panel
    const buttons = screen.getAllByRole('button')
    const historyButton = buttons.find((btn) => btn.querySelector('svg.lucide-clock'))
    await user.click(historyButton!)

    // Panel should be visible
    expect(screen.getByText('Run History')).toBeInTheDocument()

    // Find and click the close button in the Run History panel
    const closeButtons = screen.getAllByRole('button')
    const panelCloseButton = closeButtons.find((btn) => {
      const parent = btn.closest('.glass')
      return parent && parent.textContent?.includes('Run History') && btn.querySelector('svg.lucide-x')
    })
    expect(panelCloseButton).toBeTruthy()

    await user.click(panelCloseButton!)

    // Panel should be hidden
    expect(screen.queryByText('Run History')).not.toBeInTheDocument()
  })

  it('refetches executions when opening history panel', async () => {
    const mockExecutionsRefetch = vi.fn()

    // Mock successful data fetch with separate refetch functions
    vi.mocked(workflowClient.useQuery).mockImplementation((method: string, path: string) => {
      if (path === '/executions') {
        return {
          data: { resources: [] },
          isLoading: false,
          error: null,
          refetch: mockExecutionsRefetch,
        }
      }
      return {
        data: mockWorkflow,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      }
    })

    const user = userEvent.setup()
    render(<Automation />)

    // Find and click the history button to open the panel
    const buttons = screen.getAllByRole('button')
    const historyButton = buttons.find((btn) => btn.querySelector('svg.lucide-clock'))
    expect(historyButton).toBeTruthy()

    await user.click(historyButton!)

    // Verify that executions refetch was called when opening the panel
    expect(mockExecutionsRefetch).toHaveBeenCalledTimes(1)
  })

  it('refetches executions after successfully running automation', async () => {
    const mockExecutionsRefetch = vi.fn()
    const mockExecuteAutomation = vi.fn()

    // Mock successful data fetch with separate refetch functions
    vi.mocked(workflowClient.useQuery).mockImplementation((method: string, path: string) => {
      if (path === '/executions') {
        return {
          data: { resources: [] },
          isLoading: false,
          error: null,
          refetch: mockExecutionsRefetch,
        }
      }
      return {
        data: mockWorkflow,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      }
    })

    vi.mocked(workflowClient.useMutation).mockReturnValue({
      mutate: mockExecuteAutomation,
    })

    const user = userEvent.setup()
    render(<Automation />)

    // Find and click the Run button
    const buttons = screen.getAllByRole('button')
    const runButton = buttons.find((btn) => btn.textContent === 'Run')
    expect(runButton).toBeTruthy()

    await user.click(runButton!)

    // Find and click the "Run now" button in the confirmation dialog
    const confirmButton = screen.getByText('Run now')
    await user.click(confirmButton)

    // Verify that executeAutomation was called
    expect(mockExecuteAutomation).toHaveBeenCalledTimes(1)

    // Get the onSuccess callback and call it to simulate successful execution
    const onSuccessCallback = mockExecuteAutomation.mock.calls[0][1].onSuccess
    onSuccessCallback()

    // Verify that executions refetch was called after successful execution
    expect(mockExecutionsRefetch).toHaveBeenCalledTimes(1)
  })
})

describe('AutomationSidepanel', () => {
  it('renders workflow details when no nodes are selected', () => {
    // Spy on useSelectedNodes to return no selected nodes
    const useSelectedNodesSpy = vi.spyOn(useSelectedNodeModule, 'useSelectedNodes').mockReturnValue([])

    render(<AutomationSidepanel workflow={mockWorkflow} onClose={vi.fn()} />)

    // Check workflow details header
    expect(screen.getByText('Workflow Details')).toBeInTheDocument()

    // Check workflow definition is rendered
    expect(screen.getByText(/Workflow Definition/i)).toBeInTheDocument()

    useSelectedNodesSpy.mockRestore()
  })

  it('renders multiple selected nodes', () => {
    const selectedNodes: Node[] = [
      {
        id: 'node1',
        type: 'task',
        position: { x: 0, y: 0 },
        data: { name: 'Task 1', description: 'First task' },
      },
      {
        id: 'node2',
        type: 'condition',
        position: { x: 100, y: 100 },
        data: { name: 'Condition 1', description: 'Conditional check' },
      },
    ]

    // Spy on useSelectedNodes to return multiple selected nodes
    const useSelectedNodesSpy = vi.spyOn(useSelectedNodeModule, 'useSelectedNodes').mockReturnValue(selectedNodes)

    render(<AutomationSidepanel workflow={mockWorkflow} onClose={vi.fn()} />)

    // Check that node details are rendered
    const nodeList = screen.getByRole('list')
    const nodeItems = within(nodeList).getAllByRole('listitem')
    expect(nodeItems).toHaveLength(2)

    useSelectedNodesSpy.mockRestore()
  })

  it('renders node-specific details for a single selected node', () => {
    const selectedNode: Node = {
      id: 'task1',
      type: 'task',
      position: { x: 50, y: 50 },
      data: {
        name: 'Test Task',
        description: 'A task for testing',
        task: { executor: 'script', config: { language: 'python', code: 'print("Hello")' } },
      },
    }

    // Spy on useSelectedNodes to return a single selected node
    const useSelectedNodesSpy = vi.spyOn(useSelectedNodeModule, 'useSelectedNodes').mockReturnValue([selectedNode])

    render(<AutomationSidepanel workflow={mockWorkflow} onClose={vi.fn()} />)

    // Check specific task details are rendered
    expect(screen.getByText('Test Task')).toBeInTheDocument()
    expect(screen.getByText('print("Hello")')).toBeInTheDocument()

    useSelectedNodesSpy.mockRestore()
  })
})
