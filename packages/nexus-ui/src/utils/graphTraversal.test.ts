import type { Edge, Node } from '@xyflow/react'
import { describe, it, expect } from 'vitest'

import { getAncestorNodes } from './graphTraversal'

describe('getAncestorNodes', () => {
  it('returns ancestors in a linear chain', () => {
    // Arrange
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ] as Edge[]

    const nodes = [
      { id: 'a', data: { name: 'Node A' }, position: { x: 0, y: 0 } },
      { id: 'b', data: { name: 'Node B' }, position: { x: 0, y: 0 } },
      { id: 'c', data: { name: 'Node C' }, position: { x: 0, y: 0 } },
    ] as Node[]

    // Act
    const result = getAncestorNodes('c', edges, nodes)

    // Assert
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ id: 'a', name: 'Node A' })
    expect(result).toContainEqual({ id: 'b', name: 'Node B' })
  })

  it('returns ancestors in a diamond/join pattern', () => {
    // Arrange
    const edges = [
      { id: 'e1', source: 'a', target: 'c' },
      { id: 'e2', source: 'b', target: 'c' },
    ] as Edge[]

    const nodes = [
      { id: 'a', data: { name: 'Node A' }, position: { x: 0, y: 0 } },
      { id: 'b', data: { name: 'Node B' }, position: { x: 0, y: 0 } },
      { id: 'c', data: { name: 'Node C' }, position: { x: 0, y: 0 } },
    ] as Node[]

    // Act
    const result = getAncestorNodes('c', edges, nodes)

    // Assert
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ id: 'a', name: 'Node A' })
    expect(result).toContainEqual({ id: 'b', name: 'Node B' })
  })

  it('returns empty array for root node with no predecessors', () => {
    // Arrange
    const edges = [{ id: 'e1', source: 'a', target: 'b' }] as Edge[]

    const nodes = [
      { id: 'a', data: { name: 'Node A' }, position: { x: 0, y: 0 } },
      { id: 'b', data: { name: 'Node B' }, position: { x: 0, y: 0 } },
    ] as Node[]

    // Act
    const result = getAncestorNodes('a', edges, nodes)

    // Assert
    expect(result).toHaveLength(0)
  })

  it('handles cycles without infinite loop', () => {
    // Arrange
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' }, // Creates a cycle
    ] as Edge[]

    const nodes = [
      { id: 'a', data: { name: 'Node A' }, position: { x: 0, y: 0 } },
      { id: 'b', data: { name: 'Node B' }, position: { x: 0, y: 0 } },
    ] as Node[]

    // Act
    const result = getAncestorNodes('b', edges, nodes)

    // Assert
    // In a cycle A→B→A, starting from B (target) will find A (direct ancestor)
    // B itself is excluded because it's the target node (seeded in visited set)
    expect(result).toHaveLength(1)
    expect(result).toContainEqual({ id: 'a', name: 'Node A' })
  })

  it('uses node name when available, falls back to ID', () => {
    // Arrange
    const edges = [
      { id: 'e1', source: 'a', target: 'c' },
      { id: 'e2', source: 'b', target: 'c' },
    ] as Edge[]

    const nodes = [
      { id: 'a', data: { name: 'Custom Name A' }, position: { x: 0, y: 0 } },
      { id: 'b', data: {}, position: { x: 0, y: 0 } }, // No name property
      { id: 'c', data: { name: 'Node C' }, position: { x: 0, y: 0 } },
    ] as Node[]

    // Act
    const result = getAncestorNodes('c', edges, nodes)

    // Assert
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ id: 'a', name: 'Custom Name A' })
    expect(result).toContainEqual({ id: 'b', name: 'b' }) // Falls back to ID
  })

  it('handles missing node data gracefully', () => {
    // Arrange
    const edges = [{ id: 'e1', source: 'a', target: 'b' }] as Edge[]

    const nodes = [
      { id: 'a', data: { name: 'Node A' }, position: { x: 0, y: 0 } },
      { id: 'b', data: { name: 'Node B' }, position: { x: 0, y: 0 } },
    ] as Node[]

    // Act - reference a node that doesn't exist in nodes array
    const result = getAncestorNodes('b', edges, [nodes[1]])

    // Assert
    expect(result).toHaveLength(1)
    expect(result).toContainEqual({ id: 'a', name: 'a' }) // Falls back to ID
  })

  it('excludes trigger nodes from ancestors', () => {
    // Arrange — trigger-0 → a → b
    const edges = [
      { id: 'e1', source: 'trigger-0', target: 'a' },
      { id: 'e2', source: 'a', target: 'b' },
    ] as Edge[]

    const nodes = [
      { id: 'trigger-0', data: { name: 'Manual trigger' }, position: { x: 0, y: 0 } },
      { id: 'a', data: { name: 'Node A' }, position: { x: 0, y: 0 } },
      { id: 'b', data: { name: 'Node B' }, position: { x: 0, y: 0 } },
    ] as Node[]

    // Act
    const result = getAncestorNodes('b', edges, nodes)

    // Assert — trigger-0 is traversed but not included in output
    expect(result).toHaveLength(1)
    expect(result).toContainEqual({ id: 'a', name: 'Node A' })
  })

  it('handles complex graph with multiple levels', () => {
    // Arrange
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'c', target: 'd' },
      { id: 'e4', source: 'x', target: 'b' }, // Another path to b
    ] as Edge[]

    const nodes = [
      { id: 'a', data: { name: 'Node A' }, position: { x: 0, y: 0 } },
      { id: 'b', data: { name: 'Node B' }, position: { x: 0, y: 0 } },
      { id: 'c', data: { name: 'Node C' }, position: { x: 0, y: 0 } },
      { id: 'd', data: { name: 'Node D' }, position: { x: 0, y: 0 } },
      { id: 'x', data: { name: 'Node X' }, position: { x: 0, y: 0 } },
    ] as Node[]

    // Act
    const result = getAncestorNodes('d', edges, nodes)

    // Assert
    expect(result).toHaveLength(4)
    expect(result).toContainEqual({ id: 'a', name: 'Node A' })
    expect(result).toContainEqual({ id: 'b', name: 'Node B' })
    expect(result).toContainEqual({ id: 'c', name: 'Node C' })
    expect(result).toContainEqual({ id: 'x', name: 'Node X' })
  })
})
