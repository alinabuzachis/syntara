import { describe, expect, it } from 'vitest'

import { parseImportedDefinition } from './parseImportedDefinition'
import { parseNodePositions } from './processExistingWorkflow'

describe('parseImportedDefinition', () => {
  it('converts a basic definition with nodes, edges, and triggers', () => {
    const definition = {
      triggers: [{ id: 'webhook_0', type: 'webhook', parameters: {} }],
      nodes: [{ id: 'node1', type: 'action', name: 'My Action', parameters: {} }],
      edges: [{ from: 'webhook_0', to: 'node1' }],
    }

    const { workflowDef, edges } = parseImportedDefinition(definition)

    expect(workflowDef.workflow.activities).toHaveLength(1)
    expect(workflowDef.workflow.activities[0].id).toBe('node1')
    expect(workflowDef.triggers).toHaveLength(1)
    expect(edges).toHaveLength(1)
    expect(edges[0].target).toBe('node1')
  })

  it('assigns IDs to triggers that lack them', () => {
    const definition = {
      triggers: [{ type: 'schedule', parameters: {} }],
      nodes: [{ id: 'node1', type: 'action', name: 'Test', parameters: {} }],
      edges: [],
    }

    const { workflowDef } = parseImportedDefinition(definition)

    const trigger = workflowDef.triggers?.[0] as { id?: string }
    expect(trigger.id).toBe('schedule_0')
  })

  it('maps trigger IDs to display IDs in edges', () => {
    const definition = {
      triggers: [{ id: 'my_trigger', type: 'webhook', parameters: {} }],
      nodes: [{ id: 'node1', type: 'action', name: 'Test', parameters: {} }],
      edges: [{ from: 'my_trigger', to: 'node1' }],
    }

    const { edges } = parseImportedDefinition(definition)

    expect(edges).toHaveLength(1)
    // Trigger display IDs use the buildTriggerNodeId format (trigger-0, trigger-1, etc.)
    expect(edges[0].source).toMatch(/^trigger-/)
  })

  it('filters orphaned edges', () => {
    const definition = {
      triggers: [],
      nodes: [{ id: 'node1', type: 'action', name: 'Test', parameters: {} }],
      edges: [{ from: 'nonexistent', to: 'node1' }],
    }

    const { edges } = parseImportedDefinition(definition)

    expect(edges).toHaveLength(0)
  })

  it('handles empty definition', () => {
    const definition = {
      triggers: [],
      nodes: [],
      edges: [],
    }

    const { workflowDef, edges } = parseImportedDefinition(definition)

    expect(workflowDef.workflow.activities).toHaveLength(0)
    expect(workflowDef.triggers).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })

  it('only carries name and description from the definition', () => {
    const definition = {
      triggers: [],
      nodes: [{ id: 'node1', type: 'action', name: 'Test', parameters: {} }],
      edges: [],
      name: 'My Workflow',
      description: 'A test workflow',
      unexpected_field: 'should not appear',
      schema_version: '2.0.0',
    }

    const { workflowDef } = parseImportedDefinition(definition)
    const raw = workflowDef as unknown as Record<string, unknown>

    expect(raw.name).toBe('My Workflow')
    expect(raw.description).toBe('A test workflow')
    expect(raw.unexpected_field).toBeUndefined()
    expect(raw.schema_version).toBeUndefined()
  })

  it('omits name and description when not strings', () => {
    const definition = {
      triggers: [],
      nodes: [],
      edges: [],
      name: 123,
      description: { nested: true },
    }

    const { workflowDef } = parseImportedDefinition(definition)
    const raw = workflowDef as unknown as Record<string, unknown>

    expect(raw.name).toBeUndefined()
    expect(raw.description).toBeUndefined()
  })

  it('extracts node positions from definition', () => {
    const definition = {
      triggers: [{ id: 'trig_1', type: 'webhook', parameters: {}, position: { x: 10, y: 20 } }],
      nodes: [{ id: 'node1', type: 'action', name: 'A', parameters: {}, position: { x: 100, y: 200 } }],
      edges: [],
    }

    const { nodePositions } = parseImportedDefinition(definition)

    expect(nodePositions).toEqual({
      trig_1: { x: 10, y: 20 },
      node1: { x: 100, y: 200 },
    })
  })

  it('returns empty positions when nodes have no position field', () => {
    const definition = {
      triggers: [{ id: 'trig_1', type: 'webhook', parameters: {} }],
      nodes: [{ id: 'node1', type: 'action', name: 'A', parameters: {} }],
      edges: [],
    }

    const { nodePositions } = parseImportedDefinition(definition)

    expect(nodePositions).toEqual({})
  })

  it('handles edges with ports', () => {
    const definition = {
      triggers: [],
      nodes: [
        { id: 'node1', type: 'action', name: 'A', parameters: {} },
        { id: 'node2', type: 'action', name: 'B', parameters: {} },
      ],
      edges: [{ from: 'node1', to: 'node2', from_port: 'iterate' }],
    }

    const { edges } = parseImportedDefinition(definition)

    expect(edges).toHaveLength(1)
    expect(edges[0].id).toContain('-iterate')
  })
})

describe('parseNodePositions', () => {
  it('extracts valid positions from nodes', () => {
    const nodes = [
      { id: 'a', position: { x: 10, y: 20 } },
      { id: 'b', position: { x: 300, y: 400 } },
    ] as Array<Record<string, unknown>>

    expect(parseNodePositions(nodes)).toEqual({
      a: { x: 10, y: 20 },
      b: { x: 300, y: 400 },
    })
  })

  it('skips nodes without a position field', () => {
    const nodes = [{ id: 'a' }, { id: 'b', position: { x: 1, y: 2 } }] as Array<Record<string, unknown>>

    expect(parseNodePositions(nodes)).toEqual({ b: { x: 1, y: 2 } })
  })

  it('rejects NaN coordinates', () => {
    const nodes = [{ id: 'a', position: { x: Number.NaN, y: 10 } }] as Array<Record<string, unknown>>

    expect(parseNodePositions(nodes)).toEqual({})
  })

  it('rejects Infinity coordinates', () => {
    const nodes = [{ id: 'a', position: { x: 5, y: Infinity } }] as Array<Record<string, unknown>>

    expect(parseNodePositions(nodes)).toEqual({})
  })

  it('rejects non-number coordinates', () => {
    const nodes = [{ id: 'a', position: { x: '10', y: 20 } }] as Array<Record<string, unknown>>

    expect(parseNodePositions(nodes)).toEqual({})
  })

  it('skips nodes with non-string or empty IDs', () => {
    const nodes = [
      { id: null, position: { x: 1, y: 2 } },
      { id: undefined, position: { x: 3, y: 4 } },
      { id: '', position: { x: 5, y: 6 } },
      { id: 123, position: { x: 7, y: 8 } },
      { id: 'valid', position: { x: 9, y: 10 } },
    ] as Array<Record<string, unknown>>

    expect(parseNodePositions(nodes)).toEqual({ valid: { x: 9, y: 10 } })
  })

  it('returns empty object for empty input', () => {
    expect(parseNodePositions([])).toEqual({})
  })

  it('rejects coordinates exceeding magnitude bounds', () => {
    const nodes = [
      { id: 'a', position: { x: 1_000_001, y: 0 } },
      { id: 'b', position: { x: 0, y: -1_000_001 } },
      { id: 'c', position: { x: 999_999, y: -999_999 } },
    ] as Array<Record<string, unknown>>

    expect(parseNodePositions(nodes)).toEqual({ c: { x: 999_999, y: -999_999 } })
  })

  it('is immune to prototype pollution via __proto__ node ID', () => {
    const nodes = [{ id: '__proto__', position: { x: 1, y: 2 } }] as Array<Record<string, unknown>>
    const result = parseNodePositions(nodes)
    const plain = {} as Record<string, unknown>
    expect(plain['__proto__']).not.toEqual({ x: 1, y: 2 })
    expect(Object.getPrototypeOf(result)).toBeNull()
  })
})
