import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { workflowClient } from '../../client'
import Automation, { AutomationSidepanel } from './Automation'
import type { WorkflowWithVersion } from '@ansible/nexus-contracts'
import * as useSelectedNodeModule from './canvas/nodes/common/useSelectedNode'
import type { Node } from '@xyflow/react'

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
  },
}))

// Mock Wouter's useParams
vi.mock('wouter', () => ({
  useParams: () => ({ workflowId: '1' }),
}))

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
    })

    render(<Automation />)

    // Verify error state is rendered
    expect(screen.getByText('Error loading workflow')).toBeInTheDocument()
  })
})

describe('AutomationSidepanel', () => {
  it('renders workflow details when no nodes are selected', () => {
    // Spy on useSelectedNodes to return no selected nodes
    const useSelectedNodesSpy = vi.spyOn(useSelectedNodeModule, 'useSelectedNodes').mockReturnValue([])

    render(<AutomationSidepanel workflow={mockWorkflow} />)

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

    render(<AutomationSidepanel workflow={mockWorkflow} />)

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

    render(<AutomationSidepanel workflow={mockWorkflow} />)

    // Check specific task details are rendered
    expect(screen.getByText('Test Task')).toBeInTheDocument()
    expect(screen.getByText('print("Hello")')).toBeInTheDocument()

    useSelectedNodesSpy.mockRestore()
  })
})
