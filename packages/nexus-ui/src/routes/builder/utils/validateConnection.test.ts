import type { Connection } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import { validateConnection } from './validateConnection'

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
})
