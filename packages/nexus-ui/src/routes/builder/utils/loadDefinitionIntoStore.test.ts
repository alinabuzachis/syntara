import { describe, expect, it } from 'vitest'

import { loadDefinitionIntoStore } from './loadDefinitionIntoStore'

describe('loadDefinitionIntoStore', () => {
  it('converts a basic definition with nodes, edges, and triggers', () => {
    const definition = {
      triggers: [{ id: 'webhook_0', type: 'webhook', config: {} }],
      nodes: [{ id: 'node1', type: 'action', name: 'My Action', config: {} }],
      edges: [{ from: 'webhook_0', to: 'node1' }],
    }

    const { workflowDef, edges } = loadDefinitionIntoStore(definition)

    expect(workflowDef.workflow.activities).toHaveLength(1)
    expect(workflowDef.workflow.activities[0].id).toBe('node1')
    expect(workflowDef.triggers).toHaveLength(1)
    expect(edges).toHaveLength(1)
    expect(edges[0].target).toBe('node1')
  })

  it('assigns IDs to triggers that lack them', () => {
    const definition = {
      triggers: [{ type: 'schedule', config: {} }],
      nodes: [{ id: 'node1', type: 'action', name: 'Test', config: {} }],
      edges: [],
    }

    const { workflowDef } = loadDefinitionIntoStore(definition)

    const trigger = workflowDef.triggers?.[0] as { id?: string }
    expect(trigger.id).toBe('schedule_0')
  })

  it('maps trigger IDs to display IDs in edges', () => {
    const definition = {
      triggers: [{ id: 'my_trigger', type: 'webhook', config: {} }],
      nodes: [{ id: 'node1', type: 'action', name: 'Test', config: {} }],
      edges: [{ from: 'my_trigger', to: 'node1' }],
    }

    const { edges } = loadDefinitionIntoStore(definition)

    expect(edges).toHaveLength(1)
    // Trigger display IDs use the buildTriggerNodeId format (trigger-0, trigger-1, etc.)
    expect(edges[0].source).toMatch(/^trigger-/)
  })

  it('filters orphaned edges', () => {
    const definition = {
      triggers: [],
      nodes: [{ id: 'node1', type: 'action', name: 'Test', config: {} }],
      edges: [{ from: 'nonexistent', to: 'node1' }],
    }

    const { edges } = loadDefinitionIntoStore(definition)

    expect(edges).toHaveLength(0)
  })

  it('handles empty definition', () => {
    const definition = {
      triggers: [],
      nodes: [],
      edges: [],
    }

    const { workflowDef, edges } = loadDefinitionIntoStore(definition)

    expect(workflowDef.workflow.activities).toHaveLength(0)
    expect(workflowDef.triggers).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })

  it('only carries name and description from the definition', () => {
    const definition = {
      triggers: [],
      nodes: [{ id: 'node1', type: 'action', name: 'Test', config: {} }],
      edges: [],
      name: 'My Workflow',
      description: 'A test workflow',
      unexpected_field: 'should not appear',
      schema_version: '2.0.0',
    }

    const { workflowDef } = loadDefinitionIntoStore(definition)
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

    const { workflowDef } = loadDefinitionIntoStore(definition)
    const raw = workflowDef as unknown as Record<string, unknown>

    expect(raw.name).toBeUndefined()
    expect(raw.description).toBeUndefined()
  })

  it('handles edges with ports', () => {
    const definition = {
      triggers: [],
      nodes: [
        { id: 'node1', type: 'action', name: 'A', config: {} },
        { id: 'node2', type: 'action', name: 'B', config: {} },
      ],
      edges: [{ from: 'node1', to: 'node2', from_port: 'iterate' }],
    }

    const { edges } = loadDefinitionIntoStore(definition)

    expect(edges).toHaveLength(1)
    expect(edges[0].id).toContain('-iterate')
  })
})
