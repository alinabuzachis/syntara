import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { EdgeConnection } from '../types/edge'

import { buildWorkflowDefinition } from './workflowDefinitionBuilder'

/** Helper to create a minimal activity with a given ID for edge validation tests */
function activity(id: string): Activity {
  return { id, type: 'script', config: {} }
}

describe('buildWorkflowDefinition', () => {
  it('builds basic workflow definition with minimal data', () => {
    const result = buildWorkflowDefinition('Test Workflow', '', [], [], { edges: [] })

    expect(result).toEqual({
      schema_version: '2.0.0',
      name: 'Test Workflow',
      description: undefined,
      triggers: [],
      nodes: [],
      edges: [],
    })
  })

  it('includes description when provided', () => {
    const result = buildWorkflowDefinition('Test Workflow', 'Test Description', [], [], { edges: [] })

    expect(result.description).toBe('Test Description')
  })

  it('omits description when empty string', () => {
    const result = buildWorkflowDefinition('Test Workflow', '', [], [], { edges: [] })

    expect(result.description).toBeUndefined()
  })

  describe('Trigger mapping', () => {
    it('maps triggers with all properties', () => {
      const triggers: Activity[] = [
        {
          id: 'webhook_trigger_1',
          type: 'webhook',
          name: 'My Webhook',
          config: { url: 'https://example.com' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', [], triggers, { edges: [] })

      expect(result.triggers).toEqual([
        {
          id: 'webhook_trigger_1',
          type: 'webhook',
          name: 'My Webhook',
          config: { url: 'https://example.com' },
        },
      ])
    })

    it('omits trigger name when not provided', () => {
      const triggers: Activity[] = [
        {
          id: 'trigger-1',
          type: 'manual_trigger',
          config: {},
        },
      ]

      const result = buildWorkflowDefinition('Test', '', [], triggers, { edges: [] })

      expect(result.triggers[0]).not.toHaveProperty('name')
    })

    it('uses empty config when config is undefined', () => {
      const triggers: Activity[] = [
        {
          id: 'trigger-1',
          type: 'manual_trigger',
          config: undefined as unknown as Record<string, unknown>,
        },
      ]

      const result = buildWorkflowDefinition('Test', '', [], triggers, { edges: [] })

      expect(result.triggers[0].config).toEqual({})
    })
  })

  describe('Activity (node) mapping', () => {
    it('maps activities with all properties', () => {
      const activities: Activity[] = [
        {
          id: 'task-1',
          type: 'script',
          name: 'My Script',
          config: { code: 'print("hello")' },
          timeout: 300,
          retry_policy: { max_attempts: 3, backoff: 'exponential' },
          outputs: { result: '$.output' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0]).toMatchObject({
        id: 'task-1',
        type: 'script',
        name: 'My Script',
        config: { code: 'print("hello")' },
        timeout: 300,
        retry_policy: { max_attempts: 3, backoff: 'exponential' },
        outputs: { result: '$.output' },
      })
    })

    it('includes inputs when activity has inputs property', () => {
      const activities: Activity[] = [
        {
          id: 'task-1',
          type: 'script',
          config: {},
          inputs: { param1: 'value1', param2: 'value2' },
        } as Activity & { inputs: Record<string, unknown> },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0]).toHaveProperty('inputs')
      expect(result.nodes[0].inputs).toEqual({ param1: 'value1', param2: 'value2' })
    })

    it('omits inputs when activity does not have inputs property', () => {
      const activities: Activity[] = [
        {
          id: 'task-1',
          type: 'script',
          config: {},
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0]).not.toHaveProperty('inputs')
    })

    it('omits optional properties when not provided', () => {
      const activities: Activity[] = [
        {
          id: 'task-1',
          type: 'script',
          config: {},
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0]).not.toHaveProperty('name')
      expect(result.nodes[0]).not.toHaveProperty('timeout')
      expect(result.nodes[0]).not.toHaveProperty('retry_policy')
      expect(result.nodes[0]).not.toHaveProperty('outputs')
    })

    it('includes timeout when zero', () => {
      const activities: Activity[] = [
        {
          id: 'task-1',
          type: 'script',
          config: {},
          timeout: 0,
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0]).toHaveProperty('timeout', 0)
    })
  })

  describe('Edge mapping', () => {
    it('maps basic edge without handles', () => {
      const activities = [activity('task-1'), activity('task-2')]
      const edges: EdgeConnection[] = [
        {
          id: 'e1',
          source: 'task-1',
          target: 'task-2',
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges })

      expect(result.edges[0]).toEqual({
        from: 'task-1',
        to: 'task-2',
      })
    })

    it('maps sourceHandle to from_port', () => {
      const activities = [activity('loop-1'), activity('task-1')]
      const edges: EdgeConnection[] = [
        {
          id: 'e1',
          source: 'loop-1',
          target: 'task-1',
          sourceHandle: 'loop',
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges })

      expect(result.edges[0]).toEqual({
        from: 'loop-1',
        to: 'task-1',
        from_port: 'iterate', // loop → iterate
      })
    })

    it('maps targetHandle to to_port', () => {
      const activities = [activity('task-1'), activity('loop-1')]
      const edges: EdgeConnection[] = [
        {
          id: 'e1',
          source: 'task-1',
          target: 'loop-1',
          targetHandle: 'done',
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges })

      expect(result.edges[0]).toEqual({
        from: 'task-1',
        to: 'loop-1',
        to_port: 'complete', // done → complete
      })
    })

    it('omits to_port when targetHandle is "target"', () => {
      const activities = [activity('task-1'), activity('task-2')]
      const edges: EdgeConnection[] = [
        {
          id: 'e1',
          source: 'task-1',
          target: 'task-2',
          targetHandle: 'target',
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges })

      expect(result.edges[0]).toEqual({
        from: 'task-1',
        to: 'task-2',
      })
      expect(result.edges[0]).not.toHaveProperty('to_port')
    })

    it('omits to_port when targetHandle is undefined', () => {
      const activities = [activity('task-1'), activity('task-2')]
      const edges: EdgeConnection[] = [
        {
          id: 'e1',
          source: 'task-1',
          target: 'task-2',
          targetHandle: undefined,
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges })

      expect(result.edges[0]).not.toHaveProperty('to_port')
    })
  })

  describe('Trigger ID mapping in edges', () => {
    it('maps trigger display ID to definition ID in source', () => {
      const activities = [activity('task-1')]
      const triggers: Activity[] = [
        {
          id: 'webhook_trigger_1',
          type: 'webhook',
          config: {},
        },
      ]

      const edges: EdgeConnection[] = [
        {
          id: 'e1',
          source: 'trigger-0', // Display ID
          target: 'task-1',
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, triggers, { edges })

      expect(result.edges[0].from).toBe('webhook_trigger_1') // Mapped to definition ID
    })

    it('maps trigger display ID to definition ID in target', () => {
      const activities = [activity('task-1')]
      const triggers: Activity[] = [
        {
          id: 'webhook_trigger_1',
          type: 'webhook',
          config: {},
        },
      ]

      const edges: EdgeConnection[] = [
        {
          id: 'e1',
          source: 'task-1',
          target: 'trigger-0', // Display ID
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, triggers, { edges })

      expect(result.edges[0].to).toBe('webhook_trigger_1') // Mapped to definition ID
    })

    it('SECURITY: throws error when trigger has no id property (prevents display ID leak)', () => {
      const triggers: Activity[] = [
        {
          type: 'webhook',
          config: {},
        } as Activity, // No id property
      ]

      const edges: EdgeConnection[] = [
        {
          id: 'e1',
          source: 'trigger-0',
          target: 'task-1',
        },
      ]

      // SECURITY: Must throw instead of falling back to display ID
      // Display IDs (trigger-0) are ephemeral UI constructs and must never
      // appear in persisted workflow definitions sent to backend API
      expect(() => buildWorkflowDefinition('Test', '', [], triggers, { edges })).toThrow(
        /Trigger at index 0 is missing an ID.*Display IDs like "trigger-0" cannot be used/
      )
    })

    it('uses source ID as-is when not a trigger reference', () => {
      const activities = [activity('task-1'), activity('task-2')]
      const edges: EdgeConnection[] = [
        {
          id: 'e1',
          source: 'task-1',
          target: 'task-2',
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges })

      expect(result.edges[0].from).toBe('task-1')
      expect(result.edges[0].to).toBe('task-2')
    })

    it('handles multiple triggers with correct index mapping', () => {
      const activities = [activity('task-1'), activity('task-2'), activity('task-3')]
      const triggers: Activity[] = [
        { id: 'trigger_a', type: 'manual_trigger', config: {} },
        { id: 'trigger_b', type: 'webhook', config: {} },
        { id: 'trigger_c', type: 'scheduled', config: {} },
      ]

      const edges: EdgeConnection[] = [
        { id: 'e1', source: 'trigger-0', target: 'task-1' },
        { id: 'e2', source: 'trigger-1', target: 'task-2' },
        { id: 'e3', source: 'trigger-2', target: 'task-3' },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, triggers, { edges })

      expect(result.edges[0].from).toBe('trigger_a')
      expect(result.edges[1].from).toBe('trigger_b')
      expect(result.edges[2].from).toBe('trigger_c')
    })
  })

  describe('Complex workflow', () => {
    it('builds complete workflow with triggers, activities, and edges', () => {
      const triggers: Activity[] = [
        {
          id: 'webhook_trigger_1',
          type: 'webhook',
          name: 'My Webhook',
          config: { url: 'https://example.com' },
        },
      ]

      const activities: Activity[] = [
        {
          id: 'loop-1',
          type: 'loop',
          name: 'Process Items',
          config: { type: 'for_each', items: '$.items' },
        },
        {
          id: 'task-1',
          type: 'script',
          name: 'Process Item',
          config: { code: 'print(item)' },
          inputs: { item: '$.current_item' },
        } as Activity & { inputs: Record<string, unknown> },
      ]

      const edges: EdgeConnection[] = [
        { id: 'e1', source: 'trigger-0', target: 'loop-1' },
        { id: 'e2', source: 'loop-1', target: 'task-1', sourceHandle: 'loop' },
        { id: 'e3', source: 'task-1', target: 'loop-1', targetHandle: 'done' },
      ]

      const result = buildWorkflowDefinition('Complex Workflow', 'A complex test workflow', activities, triggers, {
        edges,
      })

      expect(result).toMatchObject({
        schema_version: '2.0.0',
        name: 'Complex Workflow',
        description: 'A complex test workflow',
      })
      expect(result.triggers).toHaveLength(1)
      expect(result.nodes).toHaveLength(2)
      expect(result.edges).toHaveLength(3)

      // Verify trigger ID mapping
      expect(result.edges[0].from).toBe('webhook_trigger_1')
      // Verify port mapping
      expect(result.edges[1].from_port).toBe('iterate')
      expect(result.edges[2].to_port).toBe('complete')
    })
  })

  describe('Condition expression transformation', () => {
    it('transforms UI negation syntax (!) to backend syntax (not) for condition nodes', () => {
      const activities: Activity[] = [
        {
          id: 'cond-1',
          type: 'condition',
          name: 'Check Status',
          config: { condition: '!(${status} == "completed")' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].config.condition).toBe('not (${status} == "completed")')
    })

    it('transforms UI negation syntax (!) to backend syntax (not) for loop nodes', () => {
      const activities: Activity[] = [
        {
          id: 'loop-1',
          type: 'loop',
          name: 'While Loop',
          config: { type: 'while', condition: '!(${done} == true)' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].config.condition).toBe('not (${done} == true)')
    })

    it('preserves condition expressions without negation', () => {
      const activities: Activity[] = [
        {
          id: 'cond-1',
          type: 'condition',
          name: 'Check Value',
          config: { condition: '${value} > 10' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].config.condition).toBe('${value} > 10')
    })

    it('handles complex nested expressions with negation', () => {
      const activities: Activity[] = [
        {
          id: 'cond-1',
          type: 'condition',
          name: 'Complex Check',
          config: { condition: '!((${a} > 5 && ${b} < 10))' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].config.condition).toBe('not ((${a} > 5 and ${b} < 10))')
    })

    it('does not transform non-condition/loop node configs', () => {
      const activities: Activity[] = [
        {
          id: 'script-1',
          type: 'script',
          name: 'Script',
          config: { code: 'if !done: pass' }, // Python code with !, not a condition expression
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].config.code).toBe('if !done: pass')
    })

    it('handles condition expressions that are already in backend format', () => {
      const activities: Activity[] = [
        {
          id: 'cond-1',
          type: 'condition',
          name: 'Check',
          config: { condition: 'not (${value} == "test")' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      // Should remain in backend format
      expect(result.nodes[0].config.condition).toBe('not (${value} == "test")')
    })

    it('transforms "contains" operator to Python "in" operator with reversed operands', () => {
      const activities: Activity[] = [
        {
          id: 'cond1',
          type: 'condition',
          name: 'Check Message',
          config: { condition: '${message.text} contains "Hello"' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      // UI: ${message.text} contains "Hello"
      // Backend: "Hello" in ${message.text}
      expect(result.nodes[0].config.condition).toBe('"Hello" in ${message.text}')
    })

    it('transforms negated "contains" to "not in" operator', () => {
      const activities: Activity[] = [
        {
          id: 'cond1',
          type: 'condition',
          name: 'Check No Spam',
          config: { condition: '!(${email.body} contains "spam")' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      // UI: !(${email.body} contains "spam")
      // Backend: "spam" not in ${email.body}
      expect(result.nodes[0].config.condition).toBe('"spam" not in ${email.body}')
    })

    it('transforms "contains" in complex expressions', () => {
      const activities: Activity[] = [
        {
          id: 'cond1',
          type: 'condition',
          name: 'Complex Check',
          config: { condition: '${age} >= 18 && ${name} contains "Smith"' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      // Should transform both && to 'and' and 'contains' to 'in'
      expect(result.nodes[0].config.condition).toBe('(${age} >= 18 and "Smith" in ${name})')
    })
  })

  describe('Node positions', () => {
    it('includes position on nodes when nodePositions is provided', () => {
      const activities: Activity[] = [activity('task-1'), activity('task-2')]
      const nodePositions = { 'task-1': { x: 100, y: 200 }, 'task-2': { x: 300, y: 400 } }

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [], nodePositions })

      expect(result.nodes[0].position).toEqual({ x: 100, y: 200 })
      expect(result.nodes[1].position).toEqual({ x: 300, y: 400 })
    })

    it('includes position on triggers when nodePositions is provided', () => {
      const triggers: Activity[] = [{ id: 'trigger_1', type: 'manual_trigger', config: {} }]
      const nodePositions = { trigger_1: { x: 50, y: 75 } }

      const result = buildWorkflowDefinition('Test', '', [], triggers, { edges: [], nodePositions })

      expect(result.triggers[0].position).toEqual({ x: 50, y: 75 })
    })

    it('omits position when node has no stored position', () => {
      const activities: Activity[] = [activity('task-1')]

      const result = buildWorkflowDefinition('Test', '', activities, [], {
        edges: [],
        nodePositions: { 'other-node': { x: 10, y: 20 } },
      })

      expect(result.nodes[0]).not.toHaveProperty('position')
    })

    it('omits position when nodePositions is empty', () => {
      const activities: Activity[] = [activity('task-1')]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0]).not.toHaveProperty('position')
    })
  })
})
