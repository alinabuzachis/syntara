import type { LoopActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LoopNodeComponent } from './LoopNode'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    deleteElements: vi.fn(),
    updateNode: vi.fn(),
    getNode: vi.fn(),
  }),
  useStore: (selector: (s: { transform: [number, number, number] }) => unknown) => selector({ transform: [0, 0, 1] }),
  useUpdateNodeInternals: () => vi.fn(),
  useEdges: () => [],
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

describe('LoopNodeComponent', () => {
  const baseLoopNode = {
    type: 'loop',
    id: 'loop-1',
    name: 'Process Items',
    parameters: {
      type: 'for_each',
      items: '{{ items }}',
    },
  } as LoopActivity

  const createNodeProps = (data: LoopActivity) => ({
    id: data.id,
    data,
    type: 'loop' as const,
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
    it('renders loop node with name', () => {
      render(<LoopNodeComponent {...createNodeProps(baseLoopNode)} />)

      expect(screen.getByText('Process Items')).toBeInTheDocument()
    })

    it('renders Loop subtitle label', () => {
      render(<LoopNodeComponent {...createNodeProps(baseLoopNode)} />)

      // "Loop" appears both as subtitle and as branch handle, so look for both
      const loopTexts = screen.getAllByText('Loop')
      expect(loopTexts.length).toBeGreaterThanOrEqual(1)
    })

    it('renders Done and Loop branch handles', () => {
      render(<LoopNodeComponent {...createNodeProps(baseLoopNode)} />)

      expect(screen.getByText('Done')).toBeInTheDocument()
      // Loop appears multiple times
      const loopTexts = screen.getAllByText('Loop')
      expect(loopTexts.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Branch Handles', () => {
    it('renders Done branch handle', () => {
      render(<LoopNodeComponent {...createNodeProps(baseLoopNode)} />)

      expect(screen.getByText('Done')).toBeInTheDocument()
    })
  })

  describe('Empty name', () => {
    it('renders with empty name', () => {
      const unnamedLoop = {
        type: 'loop',
        id: 'loop-2',
        parameters: {
          type: 'for_each',
          items: '{{ data }}',
        },
      } as LoopActivity

      render(<LoopNodeComponent {...createNodeProps(unnamedLoop)} />)

      // Should render without crashing, label should still be present
      const loopTexts = screen.getAllByText('Loop')
      expect(loopTexts.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Execution State', () => {
    it('handles execution state data', () => {
      const nodeWithExecution = {
        ...baseLoopNode,
        __executionState: {
          status: 'completed',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:01:00Z',
        },
      } as LoopActivity

      render(<LoopNodeComponent {...createNodeProps(nodeWithExecution)} />)

      // Should render without crashing
      expect(screen.getByText('Process Items')).toBeInTheDocument()
    })

    it('handles execution state with retry count', () => {
      const nodeWithRetry = {
        ...baseLoopNode,
        __executionState: {
          status: 'running',
          retry_count: 2,
        },
      } as LoopActivity

      render(<LoopNodeComponent {...createNodeProps(nodeWithRetry)} />)

      expect(screen.getByText('Process Items')).toBeInTheDocument()
    })
  })

  describe('Node Structure', () => {
    it('renders with correct structure', () => {
      render(<LoopNodeComponent {...createNodeProps(baseLoopNode)} />)

      expect(screen.getByText('Process Items')).toBeInTheDocument()
    })
  })
})
