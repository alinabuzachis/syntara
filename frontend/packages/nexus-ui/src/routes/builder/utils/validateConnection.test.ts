import type { Connection } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import { validateConnection } from './validateConnection'
import type { EdgeType } from './workflowToGraph'

describe('validateConnection', () => {
  // Valid connections
  it('should allow standard connections between nodes', () => {
    const connection: Connection = {
      source: 'node1',
      target: 'node2',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(true)
  })

  it('should allow connections to task nodes', () => {
    const connection: Connection = {
      source: 'source1',
      target: 'task-node',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(true)
  })

  it('should allow connections to join nodes', () => {
    const connection: Connection = {
      source: 'source1',
      target: 'join-node',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(true)
  })

  it('should allow multiple connections to the same target', () => {
    const connection1: Connection = {
      source: 'source1',
      target: 'target',
      sourceHandle: null,
      targetHandle: null,
    }
    const connection2: Connection = {
      source: 'source2',
      target: 'target',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection1)).toBe(true)
    expect(validateConnection(connection2)).toBe(true)
  })

  it('should allow connection from condition node true handle', () => {
    const connection: Connection = {
      source: 'condition-1',
      target: 'task-1',
      sourceHandle: 'true',
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(true)
  })

  it('should allow connection from condition node false handle', () => {
    const connection: Connection = {
      source: 'condition-1',
      target: 'task-2',
      sourceHandle: 'false',
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(true)
  })

  it('should allow both true and false connections from the same condition node', () => {
    const trueConnection: Connection = {
      source: 'condition-1',
      target: 'task-true',
      sourceHandle: 'true',
      targetHandle: null,
    }
    const falseConnection: Connection = {
      source: 'condition-1',
      target: 'task-false',
      sourceHandle: 'false',
      targetHandle: null,
    }
    expect(validateConnection(trueConnection)).toBe(true)
    expect(validateConnection(falseConnection)).toBe(true)
  })

  it('should allow connections to condition nodes', () => {
    const connection: Connection = {
      source: 'task-1',
      target: 'condition-1',
      sourceHandle: 'source',
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(true)
  })

  it('should allow chaining condition nodes', () => {
    const connection: Connection = {
      source: 'condition-1',
      target: 'condition-2',
      sourceHandle: 'true',
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(true)
  })

  // Invalid connections
  it('should prevent self-connections', () => {
    const connection: Connection = {
      source: 'node1',
      target: 'node1',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(false)
  })

  it('should prevent condition node self-connections on true handle', () => {
    const connection: Connection = {
      source: 'condition-1',
      target: 'condition-1',
      sourceHandle: 'true',
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(false)
  })

  it('should prevent condition node self-connections on false handle', () => {
    const connection: Connection = {
      source: 'condition-1',
      target: 'condition-1',
      sourceHandle: 'false',
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(false)
  })

  it('should prevent connections to placeholder nodes', () => {
    const connection: Connection = {
      source: 'node1',
      target: 'placeholder-123',
      sourceHandle: null,
      targetHandle: null,
    }
    expect(validateConnection(connection)).toBe(false)
  })

  it('should prevent condition node connections to placeholder nodes', () => {
    const trueConnection: Connection = {
      source: 'condition-1',
      target: 'placeholder-123',
      sourceHandle: 'true',
      targetHandle: null,
    }
    const falseConnection: Connection = {
      source: 'condition-1',
      target: 'placeholder-condition-1-false',
      sourceHandle: 'false',
      targetHandle: null,
    }
    expect(validateConnection(trueConnection)).toBe(false)
    expect(validateConnection(falseConnection)).toBe(false)
  })

  // Loop handle validation
  it('should allow first connection from loop handle', () => {
    const connection: Connection = {
      source: 'loop-1',
      target: 'task-1',
      sourceHandle: 'loop',
      targetHandle: null,
    }
    const existingEdges: EdgeType[] = []
    expect(validateConnection(connection, existingEdges)).toBe(true)
  })

  it('should prevent second connection from loop handle when one already exists', () => {
    const newConnection: Connection = {
      source: 'loop-1',
      target: 'task-2',
      sourceHandle: 'loop',
      targetHandle: null,
    }
    const existingEdges: EdgeType[] = [
      {
        id: 'loop-1-loop-task-1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'loop',
        targetHandle: 'target',
        type: 'default',
      },
    ]
    expect(validateConnection(newConnection, existingEdges)).toBe(false)
  })

  it('should allow reconnecting loop handle to different target', () => {
    const existingEdgeId = 'loop-1-loop-task-1'
    const reconnection: Connection & { id: string } = {
      id: existingEdgeId,
      source: 'loop-1',
      target: 'task-2',
      sourceHandle: 'loop',
      targetHandle: null,
    }
    const existingEdges: EdgeType[] = [
      {
        id: existingEdgeId,
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'loop',
        targetHandle: 'target',
        type: 'default',
      },
    ]
    expect(validateConnection(reconnection, existingEdges)).toBe(true)
  })

  it('should allow connection from done handle even when loop handle is connected', () => {
    const doneConnection: Connection = {
      source: 'loop-1',
      target: 'task-2',
      sourceHandle: 'done',
      targetHandle: null,
    }
    const existingEdges: EdgeType[] = [
      {
        id: 'loop-1-loop-task-1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'loop',
        targetHandle: 'target',
        type: 'default',
      },
    ]
    expect(validateConnection(doneConnection, existingEdges)).toBe(true)
  })

  it('should ignore button edges when checking loop handle connections', () => {
    const newConnection: Connection = {
      source: 'loop-1',
      target: 'task-1',
      sourceHandle: 'loop',
      targetHandle: null,
    }
    const existingEdges: EdgeType[] = [
      {
        id: 'button-loop-1-loop',
        source: 'loop-1',
        target: 'placeholder-loop-1-loop',
        sourceHandle: 'loop',
        targetHandle: 'target',
        type: 'buttonEdge',
      },
    ]
    // Should allow connection even though there's a button edge, since button edges don't count
    expect(validateConnection(newConnection, existingEdges)).toBe(true)
  })

  it('should prevent multiple outgoing edges from loop handle', () => {
    // Scenario: Loop node already has one connection from its loop handle to task-1
    // User tries to add a second connection from loop handle to task-2
    const secondConnection: Connection = {
      source: 'loop-1',
      target: 'task-2',
      sourceHandle: 'loop',
      targetHandle: null,
    }
    const existingEdges: EdgeType[] = [
      {
        id: 'loop-1-loop-task-1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'loop',
        targetHandle: 'target',
        type: 'default',
      },
    ]
    // Should prevent the second connection
    expect(validateConnection(secondConnection, existingEdges)).toBe(false)
  })

  it('should allow multiple outgoing edges from done handle', () => {
    // Scenario: Loop node can have multiple connections from its done handle
    const firstDoneConnection: Connection = {
      source: 'loop-1',
      target: 'task-1',
      sourceHandle: 'done',
      targetHandle: null,
    }
    const secondDoneConnection: Connection = {
      source: 'loop-1',
      target: 'task-2',
      sourceHandle: 'done',
      targetHandle: null,
    }
    const existingEdges: EdgeType[] = [
      {
        id: 'loop-1-done-task-1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'done',
        targetHandle: 'target',
        type: 'default',
      },
    ]
    // Should allow the second connection from done handle
    expect(validateConnection(secondDoneConnection, existingEdges)).toBe(true)
    // First connection should also be valid
    expect(validateConnection(firstDoneConnection, existingEdges)).toBe(true)
  })

  it('should allow loop handle connection when done handle already has connections', () => {
    // Scenario: Loop node has connections from done handle, user adds connection from loop handle
    const loopConnection: Connection = {
      source: 'loop-1',
      target: 'task-2',
      sourceHandle: 'loop',
      targetHandle: null,
    }
    const existingEdges: EdgeType[] = [
      {
        id: 'loop-1-done-task-1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'done',
        targetHandle: 'target',
        type: 'default',
      },
    ]
    // Should allow loop handle connection even when done handle has connections
    expect(validateConnection(loopConnection, existingEdges)).toBe(true)
  })
})
