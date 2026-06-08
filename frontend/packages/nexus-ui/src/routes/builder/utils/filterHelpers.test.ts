import { describe, expect, it } from 'vitest'

import type { NodeType } from '../../workflows/canvas/nodes/NodeType'

import {
  filterButtonEdges,
  filterPlaceholderNodes,
  filterRealEdges,
  filterRealNodes,
  isButtonEdge,
  isPlaceholderNode,
  isRealEdge,
  isRealNode,
} from './filterHelpers'
import type { EdgeType } from './workflowToGraph'

describe('filterHelpers', () => {
  describe('filterRealNodes', () => {
    it('filters out placeholder nodes', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, data: {} },
        { id: 'placeholder-1', type: 'placeholder', position: { x: 0, y: 0 }, data: {} },
        { id: 'task-2', type: 'task', position: { x: 0, y: 0 }, data: {} },
      ] as NodeType[]

      const result = filterRealNodes(nodes)

      expect(result).toHaveLength(2)
      expect(result.map((n) => n.id)).toEqual(['task-1', 'task-2'])
    })

    it('filters out pending-target nodes', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, data: {} },
        { id: 'pending-target-123', type: 'placeholder', position: { x: 0, y: 0 }, data: {} },
        { id: 'task-2', type: 'task', position: { x: 0, y: 0 }, data: {} },
      ] as NodeType[]

      const result = filterRealNodes(nodes)

      expect(result).toHaveLength(2)
      expect(result.map((n) => n.id)).toEqual(['task-1', 'task-2'])
    })

    it('returns all nodes when no placeholders exist', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, data: {} },
        { id: 'task-2', type: 'task', position: { x: 0, y: 0 }, data: {} },
      ] as NodeType[]

      const result = filterRealNodes(nodes)

      expect(result).toHaveLength(2)
    })

    it('returns empty array when all nodes are placeholders', () => {
      const nodes = [
        { id: 'placeholder-1', type: 'placeholder', position: { x: 0, y: 0 }, data: {} },
        { id: 'pending-target-123', type: 'placeholder', position: { x: 0, y: 0 }, data: {} },
      ] as unknown as NodeType[]

      const result = filterRealNodes(nodes)

      expect(result).toHaveLength(0)
    })

    it('handles empty array', () => {
      const result = filterRealNodes([])
      expect(result).toEqual([])
    })
  })

  describe('filterRealEdges', () => {
    it('filters out buttonEdge type edges', () => {
      const edges: EdgeType[] = [
        { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' },
        { id: 'edge-2', source: 'node-2', target: 'node-3', type: 'buttonEdge' },
        { id: 'edge-3', source: 'node-3', target: 'node-4', type: 'default' },
      ] as EdgeType[]

      const result = filterRealEdges(edges)

      expect(result).toHaveLength(2)
      expect(result.map((e) => e.id)).toEqual(['edge-1', 'edge-3'])
    })

    it('filters out edges with button- prefix', () => {
      const edges: EdgeType[] = [
        { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' },
        { id: 'button-node-3', source: 'node-3', target: 'placeholder', type: 'default' },
        { id: 'edge-2', source: 'node-4', target: 'node-5', type: 'default' },
      ] as EdgeType[]

      const result = filterRealEdges(edges)

      expect(result).toHaveLength(2)
      expect(result.map((e) => e.id)).toEqual(['edge-1', 'edge-2'])
    })

    it('filters out edges with pending- prefix', () => {
      const edges: EdgeType[] = [
        { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' },
        { id: 'pending-drag', source: 'node-2', target: 'node-3', type: 'default' },
      ] as EdgeType[]

      const result = filterRealEdges(edges)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('edge-1')
    })

    it('handles empty array', () => {
      const result = filterRealEdges([])
      expect(result).toEqual([])
    })
  })

  describe('filterButtonEdges', () => {
    it('returns only buttonEdge type edges', () => {
      const edges: EdgeType[] = [
        { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' },
        { id: 'edge-2', source: 'node-2', target: 'node-3', type: 'buttonEdge' },
        { id: 'edge-3', source: 'node-3', target: 'node-4', type: 'default' },
      ] as EdgeType[]

      const result = filterButtonEdges(edges)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('edge-2')
    })

    it('returns edges with button- prefix', () => {
      const edges: EdgeType[] = [
        { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' },
        { id: 'button-node-3', source: 'node-3', target: 'placeholder', type: 'default' },
        { id: 'edge-2', source: 'node-4', target: 'node-5', type: 'default' },
      ] as EdgeType[]

      const result = filterButtonEdges(edges)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('button-node-3')
    })

    it('handles empty array', () => {
      const result = filterButtonEdges([])
      expect(result).toEqual([])
    })
  })

  describe('filterPlaceholderNodes', () => {
    it('returns only placeholder nodes', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, data: {} },
        { id: 'placeholder-1', type: 'placeholder', position: { x: 0, y: 0 }, data: {} },
        { id: 'task-2', type: 'task', position: { x: 0, y: 0 }, data: {} },
      ] as NodeType[]

      const result = filterPlaceholderNodes(nodes)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('placeholder-1')
    })

    it('returns pending-target nodes', () => {
      const nodes: NodeType[] = [
        { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, data: {} },
        { id: 'pending-target-123', type: 'placeholder', position: { x: 0, y: 0 }, data: {} },
      ] as NodeType[]

      const result = filterPlaceholderNodes(nodes)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('pending-target-123')
    })

    it('handles empty array', () => {
      const result = filterPlaceholderNodes([])
      expect(result).toEqual([])
    })
  })

  describe('isPlaceholderNode', () => {
    it('returns true for placeholder node', () => {
      const node = {
        id: 'placeholder-1',
        type: 'placeholder',
        position: { x: 0, y: 0 },
        data: {},
      } as unknown as NodeType

      expect(isPlaceholderNode(node)).toBe(true)
    })

    it('returns true for pending-target node', () => {
      const node = {
        id: 'pending-target-123',
        type: 'placeholder',
        position: { x: 0, y: 0 },
        data: {},
      } as unknown as NodeType

      expect(isPlaceholderNode(node)).toBe(true)
    })

    it('returns false for regular node', () => {
      const node = { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, data: {} } as NodeType

      expect(isPlaceholderNode(node)).toBe(false)
    })
  })

  describe('isButtonEdge', () => {
    it('returns true for buttonEdge type', () => {
      const edge = { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'buttonEdge' } as EdgeType

      expect(isButtonEdge(edge)).toBe(true)
    })

    it('returns true for button- prefixed edge', () => {
      const edge = { id: 'button-node-1', source: 'node-1', target: 'placeholder', type: 'default' } as EdgeType

      expect(isButtonEdge(edge)).toBe(true)
    })

    it('returns false for regular edge', () => {
      const edge = { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' } as EdgeType

      expect(isButtonEdge(edge)).toBe(false)
    })
  })

  describe('isRealNode', () => {
    it('returns true for regular node', () => {
      const node = { id: 'task-1', type: 'task', position: { x: 0, y: 0 }, data: {} } as NodeType

      expect(isRealNode(node)).toBe(true)
    })

    it('returns false for placeholder node', () => {
      const node = {
        id: 'placeholder-1',
        type: 'placeholder',
        position: { x: 0, y: 0 },
        data: {},
      } as unknown as NodeType

      expect(isRealNode(node)).toBe(false)
    })

    it('returns false for pending-target node', () => {
      const node = {
        id: 'pending-target-123',
        type: 'placeholder',
        position: { x: 0, y: 0 },
        data: {},
      } as unknown as NodeType

      expect(isRealNode(node)).toBe(false)
    })
  })

  describe('isRealEdge', () => {
    it('returns true for regular edge', () => {
      const edge = { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'default' } as EdgeType

      expect(isRealEdge(edge)).toBe(true)
    })

    it('returns false for buttonEdge', () => {
      const edge = { id: 'edge-1', source: 'node-1', target: 'node-2', type: 'buttonEdge' } as EdgeType

      expect(isRealEdge(edge)).toBe(false)
    })

    it('returns false for button- prefixed edge', () => {
      const edge = { id: 'button-node-1', source: 'node-1', target: 'placeholder', type: 'default' } as EdgeType

      expect(isRealEdge(edge)).toBe(false)
    })

    it('returns false for pending- prefixed edge', () => {
      const edge = { id: 'pending-1', source: 'node-1', target: 'node-2', type: 'default' } as EdgeType

      expect(isRealEdge(edge)).toBe(false)
    })
  })
})
