import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeType } from '../../workflows/canvas/nodes/NodeType'

import { getLayoutedElements } from './layoutEngine'
import type { EdgeType } from './workflowToGraph'

// Create mocks that can be accessed in tests
const mockSetGraph = vi.fn()
const mockSetEdge = vi.fn()
const mockSetNode = vi.fn()
const mockNode = vi.fn()

vi.mock('@dagrejs/dagre', () => {
  // Create a proper mock class for Graph
  const MockGraph = function (this: Record<string, unknown>) {
    this.setDefaultEdgeLabel = vi.fn().mockReturnThis()
    this.setGraph = mockSetGraph
    this.setEdge = mockSetEdge
    this.setNode = mockSetNode
    this.node = mockNode
    return this
  }

  return {
    default: {
      graphlib: {
        Graph: MockGraph,
      },
      layout: vi.fn(),
    },
  }
})

describe('layoutEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock for node positions
    mockNode.mockImplementation(() => ({
      x: 100,
      y: 100,
    }))
  })

  describe('getLayoutedElements', () => {
    it('returns layouted nodes and edges', () => {
      const nodes: NodeType[] = [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      ] as NodeType[]

      const edges: EdgeType[] = [
        { id: 'trigger-1-task-1', source: 'trigger-1', target: 'task-1', type: 'default' },
      ] as EdgeType[]

      const result = getLayoutedElements(nodes, edges, { direction: 'TB' })

      expect(result.nodes).toHaveLength(2)
      expect(result.edges).toHaveLength(1)
      expect(mockSetGraph).toHaveBeenCalledWith({ rankdir: 'TB', ranksep: 120, ranker: 'tight-tree' })
    })

    it('filters out placeholder nodes from layout', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
        {
          id: 'placeholder-1',
          type: 'placeholder',
          position: { x: 0, y: 0 },
          measured: { width: 50, height: 50 },
          data: {},
        },
      ] as NodeType[]

      const edges: EdgeType[] = [] as EdgeType[]

      getLayoutedElements(nodes, edges, { direction: 'TB' })

      // Placeholder should not be added to the graph
      expect(mockSetNode).toHaveBeenCalledTimes(1)
      expect(mockSetNode).toHaveBeenCalledWith('task-1', expect.any(Object))
    })

    it('filters out button edges from layout', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
        { id: 'task-2', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      ] as NodeType[]

      const edges: EdgeType[] = [
        { id: 'task-1-task-2', source: 'task-1', target: 'task-2', type: 'default' },
        { id: 'button-task-2', source: 'task-2', target: 'placeholder-1', type: 'buttonEdge' },
      ] as EdgeType[]

      getLayoutedElements(nodes, edges, { direction: 'TB' })

      // Only real edge should be added (with empty edge config since no special handles)
      expect(mockSetEdge).toHaveBeenCalledTimes(1)
      expect(mockSetEdge).toHaveBeenCalledWith('task-1', 'task-2', {})
    })

    it('excludes loop-back edges from layout', () => {
      const nodes: NodeType[] = [
        { id: 'loop-1', type: 'loop', position: { x: 0, y: 0 }, measured: { width: 300, height: 100 }, data: {} },
        { id: 'task-in-loop', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      ] as NodeType[]

      const edges: EdgeType[] = [
        { id: 'loop-1-task', source: 'loop-1', target: 'task-in-loop', sourceHandle: 'loop', type: 'loopOutgoing' },
        { id: 'task-loop-1', source: 'task-in-loop', target: 'loop-1', targetHandle: 'end', type: 'loopBack' },
      ] as EdgeType[]

      getLayoutedElements(nodes, edges, { direction: 'TB' })

      // Loop-back edge (targetHandle: 'end') should not be added
      // Loop edge (sourceHandle: 'loop') gets no special weight
      expect(mockSetEdge).toHaveBeenCalledTimes(1)
      expect(mockSetEdge).toHaveBeenCalledWith('loop-1', 'task-in-loop', {})
    })

    it('preserves placeholder nodes position', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 50, y: 50 }, measured: { width: 200, height: 80 }, data: {} },
        {
          id: 'placeholder-1',
          type: 'placeholder',
          position: { x: 100, y: 200 },
          measured: { width: 50, height: 50 },
          data: {},
        },
      ] as NodeType[]

      const edges: EdgeType[] = [] as EdgeType[]

      const result = getLayoutedElements(nodes, edges, { direction: 'TB' })

      const placeholderNode = result.nodes.find((n) => n.id === 'placeholder-1')
      // Placeholder should keep its original position
      expect(placeholderNode?.position).toEqual({ x: 100, y: 200 })
    })

    it('adds markerEnd to all edges', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
        { id: 'task-2', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      ] as NodeType[]

      const edges: EdgeType[] = [
        { id: 'task-1-task-2', source: 'task-1', target: 'task-2', type: 'default' },
      ] as EdgeType[]

      const result = getLayoutedElements(nodes, edges, { direction: 'TB' })

      expect(result.edges[0].markerEnd).toEqual({ type: 'arrowclosed' })
    })

    it('handles LR direction', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      ] as NodeType[]

      const edges: EdgeType[] = [] as EdgeType[]

      getLayoutedElements(nodes, edges, { direction: 'LR' })

      expect(mockSetGraph).toHaveBeenCalledWith({ rankdir: 'LR', ranksep: 120, ranker: 'tight-tree' })
    })

    it('handles nodes without measured dimensions', () => {
      const nodes: NodeType[] = [{ id: 'task-1', type: 'task', position: { x: 0, y: 0 }, data: {} }] as NodeType[]

      const edges: EdgeType[] = [] as EdgeType[]

      // Should not throw
      const result = getLayoutedElements(nodes, edges, { direction: 'TB' })

      expect(result.nodes).toHaveLength(1)
    })

    it('identifies loop body nodes correctly', () => {
      mockNode.mockImplementation((id: string) => {
        if (id === 'loop-1') return { x: 100, y: 100 }
        if (id === 'task-in-loop') return { x: 200, y: 100 }
        return { x: 0, y: 0 }
      })

      const nodes: NodeType[] = [
        { id: 'loop-1', type: 'loop', position: { x: 0, y: 0 }, measured: { width: 300, height: 100 }, data: {} },
        { id: 'task-in-loop', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      ] as NodeType[]

      const edges: EdgeType[] = [
        { id: 'loop-1-task', source: 'loop-1', target: 'task-in-loop', sourceHandle: 'loop', type: 'loopOutgoing' },
        { id: 'task-loop-1', source: 'task-in-loop', target: 'loop-1', targetHandle: 'end', type: 'loopBack' },
      ] as EdgeType[]

      const result = getLayoutedElements(nodes, edges, { direction: 'TB' })

      // Loop body node should have special className
      const loopBodyNode = result.nodes.find((n) => n.id === 'task-in-loop')
      expect(loopBodyNode?.className).toBe('min-w-[300px]')
    })

    it('handles empty nodes array', () => {
      const result = getLayoutedElements([], [], { direction: 'TB' })

      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })

    it('handles empty edges array', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      ] as NodeType[]

      const result = getLayoutedElements(nodes, [], { direction: 'TB' })

      expect(result.nodes).toHaveLength(1)
      expect(result.edges).toEqual([])
    })

    it('calculates correct node positions based on Dagre output', () => {
      mockNode.mockImplementation((id: string) => {
        if (id === 'task-1') return { x: 150, y: 100 }
        if (id === 'task-2') return { x: 150, y: 250 }
        return { x: 0, y: 0 }
      })

      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
        { id: 'task-2', type: 'task', position: { x: 0, y: 0 }, measured: { width: 200, height: 80 }, data: {} },
      ] as NodeType[]

      const edges: EdgeType[] = [
        { id: 'task-1-task-2', source: 'task-1', target: 'task-2', type: 'default' },
      ] as EdgeType[]

      const result = getLayoutedElements(nodes, edges, { direction: 'TB' })

      // Position should be Dagre position minus half the node dimensions
      const task1 = result.nodes.find((n) => n.id === 'task-1')
      expect(task1?.position.x).toBe(150 - 100) // 150 - (200/2)
      expect(task1?.position.y).toBe(100 - 40) // 100 - (80/2)

      const task2 = result.nodes.find((n) => n.id === 'task-2')
      expect(task2?.position.x).toBe(150 - 100)
      expect(task2?.position.y).toBe(250 - 40)
    })

    it('positions multiple nodes in loop body', () => {
      mockNode.mockImplementation((id: string) => {
        if (id === 'loop-1') return { x: 100, y: 100 }
        if (id === 'task-1-in-loop') return { x: 250, y: 100 }
        if (id === 'task-2-in-loop') return { x: 400, y: 100 }
        return { x: 0, y: 0 }
      })

      const nodes: NodeType[] = [
        { id: 'loop-1', type: 'loop', position: { x: 0, y: 0 }, measured: { width: 300, height: 100 }, data: {} },
        {
          id: 'task-1-in-loop',
          type: 'task',
          position: { x: 0, y: 0 },
          measured: { width: 200, height: 80 },
          data: {},
        },
        {
          id: 'task-2-in-loop',
          type: 'task',
          position: { x: 0, y: 0 },
          measured: { width: 200, height: 80 },
          data: {},
        },
      ] as NodeType[]

      const edges: EdgeType[] = [
        { id: 'loop-1-task-1', source: 'loop-1', target: 'task-1-in-loop', sourceHandle: 'loop', type: 'loopOutgoing' },
        {
          id: 'task-1-task-2',
          source: 'task-1-in-loop',
          target: 'task-2-in-loop',
          sourceHandle: 'source',
          type: 'default',
        },
        { id: 'task-2-loop-1', source: 'task-2-in-loop', target: 'loop-1', targetHandle: 'end', type: 'loopBack' },
      ] as EdgeType[]

      const result = getLayoutedElements(nodes, edges, { direction: 'TB' })

      // Both loop body nodes should have special className
      const task1 = result.nodes.find((n) => n.id === 'task-1-in-loop')
      const task2 = result.nodes.find((n) => n.id === 'task-2-in-loop')
      expect(task1?.className).toBe('min-w-[300px]')
      expect(task2?.className).toBe('min-w-[300px]')
    })
  })
})
