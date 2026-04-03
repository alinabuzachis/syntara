import type { TaskActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FlowNodeType } from '../../../../constants'

import { TaskReversedNodeComponent } from './TaskReversedNode'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    deleteElements: vi.fn(),
    updateNode: vi.fn(),
    getNode: vi.fn(),
  }),
  useStore: (selector: (s: { transform: [number, number, number] }) => unknown) => selector({ transform: [0, 0, 1] }),
  useUpdateNodeInternals: () => vi.fn(),
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

describe('TaskReversedNodeComponent', () => {
  const baseTaskNode: TaskActivity = {
    type: 'task',
    id: 'task-reversed-1',
    name: 'Loop Back Task',
    task: {
      executor: 'script',
      config: {
        language: 'python',
        code: 'print("hello")',
      },
    },
  }

  const createNodeProps = (data: TaskActivity) => ({
    id: data.id,
    data,
    type: FlowNodeType.TASK_REVERSED,
    position: { x: 0, y: 0 },
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selected: false,
    dragging: false,
    isConnectable: true,
    zIndex: 0,
    selectable: true,
    deletable: true,
    draggable: true,
  })

  describe('Rendering', () => {
    it('renders task reversed node with name', () => {
      render(<TaskReversedNodeComponent {...createNodeProps(baseTaskNode)} />)

      expect(screen.getByText('Loop Back Task')).toBeInTheDocument()
    })

    it('renders executor type label', () => {
      render(<TaskReversedNodeComponent {...createNodeProps(baseTaskNode)} />)

      // Script executor label
      expect(screen.getByText('Script')).toBeInTheDocument()
    })
  })

  describe('Different Executors', () => {
    it('renders agentic executor', () => {
      const agenticTask: TaskActivity = {
        type: 'task',
        id: 'task-reversed-2',
        name: 'AI Task',
        task: {
          executor: 'agentic',
          config: {
            agent: 'default-agent',
            prompt: 'Do something smart',
          },
        },
      }

      render(<TaskReversedNodeComponent {...createNodeProps(agenticTask)} />)

      expect(screen.getByText('AI Task')).toBeInTheDocument()
      expect(screen.getByText('Agentic')).toBeInTheDocument()
    })

    it('renders api executor', () => {
      const apiTask: TaskActivity = {
        type: 'task',
        id: 'task-reversed-3',
        name: 'API Call',
        task: {
          executor: 'api',
          config: {
            url: 'https://example.com',
            method: 'GET',
          },
        },
      }

      render(<TaskReversedNodeComponent {...createNodeProps(apiTask)} />)

      expect(screen.getByText('API Call')).toBeInTheDocument()
    })
  })

  describe('Execution State', () => {
    it('handles execution state data', () => {
      const nodeWithExecution = {
        ...baseTaskNode,
        __executionState: {
          status: 'running',
          started_at: '2024-01-01T00:00:00Z',
        },
      } as TaskActivity

      render(<TaskReversedNodeComponent {...createNodeProps(nodeWithExecution)} />)

      // Should render without crashing
      expect(screen.getByText('Loop Back Task')).toBeInTheDocument()
    })

    it('handles completed execution state', () => {
      const nodeWithExecution = {
        ...baseTaskNode,
        __executionState: {
          status: 'completed',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:01:00Z',
        },
      } as TaskActivity

      render(<TaskReversedNodeComponent {...createNodeProps(nodeWithExecution)} />)

      expect(screen.getByText('Loop Back Task')).toBeInTheDocument()
    })

    it('handles failed execution state', () => {
      const nodeWithError = {
        ...baseTaskNode,
        __executionState: {
          status: 'failed',
          error_details: 'Task failed',
          retry_count: 3,
        },
      } as TaskActivity

      render(<TaskReversedNodeComponent {...createNodeProps(nodeWithError)} />)

      expect(screen.getByText('Loop Back Task')).toBeInTheDocument()
    })
  })

  describe('Node Structure', () => {
    it('renders with correct structure', () => {
      const { container } = render(<TaskReversedNodeComponent {...createNodeProps(baseTaskNode)} />)

      expect(container.querySelector('.pf-v6-c-compass__panel')).toBeInTheDocument()
    })
  })

  describe('Selection State', () => {
    it('renders when selected', () => {
      const props = createNodeProps(baseTaskNode)
      props.selected = true

      render(<TaskReversedNodeComponent {...props} />)

      expect(screen.getByText('Loop Back Task')).toBeInTheDocument()
    })
  })

  describe('Task with inputs/outputs', () => {
    it('renders task with inputs', () => {
      const taskWithInputs: TaskActivity = {
        ...baseTaskNode,
        task: {
          ...baseTaskNode.task,
          inputs: { value: 'test' },
        },
      }

      render(<TaskReversedNodeComponent {...createNodeProps(taskWithInputs)} />)

      expect(screen.getByText('Loop Back Task')).toBeInTheDocument()
    })

    it('renders task with outputs', () => {
      const taskWithOutputs: TaskActivity = {
        ...baseTaskNode,
        task: {
          ...baseTaskNode.task,
          outputs: { result: 'success' },
        },
      }

      render(<TaskReversedNodeComponent {...createNodeProps(taskWithOutputs)} />)

      expect(screen.getByText('Loop Back Task')).toBeInTheDocument()
    })
  })
})
