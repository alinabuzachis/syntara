import type { Connection } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'

import { validateConnection } from './validateConnection'
import type { EdgeType } from './workflowToGraph'

describe('validateConnection', () => {
  const nodes: NodeType[] = [
    { id: 'source1', type: 'task', position: { x: 0, y: 0 }, data: {} } as unknown as NodeType,
    { id: 'source2', type: 'task', position: { x: 0, y: 0 }, data: {} } as unknown as NodeType,
    { id: 'target-task', type: 'task', position: { x: 0, y: 0 }, data: {} } as unknown as NodeType,
    { id: 'target-join', type: 'join', position: { x: 0, y: 0 }, data: {} } as unknown as NodeType,
    { id: 'placeholder-1', type: 'placeholder', position: { x: 0, y: 0 }, data: {} } as unknown as NodeType,
    { id: 'clean-target', type: 'task', position: { x: 0, y: 0 }, data: {} } as unknown as NodeType,
  ]

  const existingEdges: EdgeType[] = [
    { id: 'edge1', source: 'source1', target: 'target-task', type: 'default' },
    { id: 'edge2', source: 'source1', target: 'target-join', type: 'default' },
    { id: 'button-1', source: 'source2', target: 'target-task', type: 'buttonEdge' },
  ]

  it('should allow connection to a task node that has no incoming edges', () => {
    const connection: Connection = {
      source: 'source2',
      target: 'source1',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection, nodes, existingEdges)).toBe(true)
  })

  it('should prevent connection to a task node that already has an incoming edge', () => {
    const connection: Connection = {
      source: 'source2',
      target: 'target-task',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection, nodes, existingEdges)).toBe(false)
  })

  it('should allow connection to a join node that already has an incoming edge', () => {
    const connection: Connection = {
      source: 'source2',
      target: 'target-join',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection, nodes, existingEdges)).toBe(true)
  })

  it('should prevent connection to placeholder nodes', () => {
    const connection: Connection = {
      source: 'source1',
      target: 'placeholder-1',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection, nodes, existingEdges)).toBe(false)
  })

  it('should prevent self-connections', () => {
    const connection: Connection = {
      source: 'source1',
      target: 'source1',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection, nodes, existingEdges)).toBe(false)
  })

  it('should ignore button edges when checking for existing incoming edges', () => {
    // Add a button edge targeting a node
    const edgesWithButton: EdgeType[] = [{ id: 'button-edge', source: 'x', target: 'clean-target', type: 'buttonEdge' }]
    const connection: Connection = {
      source: 'source1',
      target: 'clean-target',
      sourceHandle: null,
      targetHandle: null,
    }
    // Should allow because button edges don't count
    expect(validateConnection(connection, nodes, edgesWithButton)).toBe(true)
  })
})
