import type { ParallelActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ParallelNodeComponent } from './ParallelNode'

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

describe('ParallelNodeComponent', () => {
  const baseParallelNode = {
    type: 'parallel',
    id: 'parallel-1',
    name: 'Run Concurrent Tasks',
    branches: [],
  } as ParallelActivity

  const createNodeProps = (data: ParallelActivity) => ({
    id: data.id,
    data,
    type: 'parallel' as const,
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
    it('renders parallel node with name', () => {
      render(<ParallelNodeComponent {...createNodeProps(baseParallelNode)} />)

      expect(screen.getByText('Run Concurrent Tasks')).toBeInTheDocument()
    })

    it('renders Parallel label', () => {
      render(<ParallelNodeComponent {...createNodeProps(baseParallelNode)} />)

      expect(screen.getByText('Parallel')).toBeInTheDocument()
    })
  })

  describe('Empty name', () => {
    it('renders with undefined name', () => {
      const unnamedParallel = {
        type: 'parallel',
        id: 'parallel-2',
        branches: [],
      } as ParallelActivity

      render(<ParallelNodeComponent {...createNodeProps(unnamedParallel)} />)

      // Should render without crashing, label should still be present
      expect(screen.getByText('Parallel')).toBeInTheDocument()
    })
  })

  describe('Execution State', () => {
    it('handles execution state data', () => {
      const nodeWithExecution = {
        ...baseParallelNode,
        __executionState: {
          status: 'running',
          started_at: '2024-01-01T00:00:00Z',
        },
      } as ParallelActivity

      render(<ParallelNodeComponent {...createNodeProps(nodeWithExecution)} />)

      // Should render without crashing
      expect(screen.getByText('Run Concurrent Tasks')).toBeInTheDocument()
    })

    it('handles completed execution state', () => {
      const nodeWithExecution = {
        ...baseParallelNode,
        __executionState: {
          status: 'completed',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:05:00Z',
        },
      } as ParallelActivity

      render(<ParallelNodeComponent {...createNodeProps(nodeWithExecution)} />)

      expect(screen.getByText('Run Concurrent Tasks')).toBeInTheDocument()
    })

    it('handles failed execution state with error', () => {
      const nodeWithError = {
        ...baseParallelNode,
        __executionState: {
          status: 'failed',
          error_details: 'Task timeout',
        },
      } as ParallelActivity

      render(<ParallelNodeComponent {...createNodeProps(nodeWithError)} />)

      expect(screen.getByText('Run Concurrent Tasks')).toBeInTheDocument()
    })
  })

  describe('Node Structure', () => {
    it('renders with correct structure', () => {
      const { container } = render(<ParallelNodeComponent {...createNodeProps(baseParallelNode)} />)

      expect(container.querySelector('.pf-v6-c-compass__panel')).toBeInTheDocument()
    })
  })

  describe('Selection State', () => {
    it('renders when selected', () => {
      const props = createNodeProps(baseParallelNode)
      props.selected = true

      render(<ParallelNodeComponent {...props} />)

      expect(screen.getByText('Run Concurrent Tasks')).toBeInTheDocument()
    })
  })
})
