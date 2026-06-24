import { TriggerTypeEnum, type Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { EdgeConnection } from '../types/edge'

import { buildWorkflowDefinition } from './workflowDefinitionBuilder'

/** Helper to create a minimal activity with a given ID for edge validation tests */
function activity(id: string): Activity {
  return { id, type: 'script', parameters: {} }
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
          type: TriggerTypeEnum.WEBHOOK_TRIGGER,
          name: 'My Webhook',
          parameters: { url: 'https://example.com' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', [], triggers, { edges: [] })

      expect(result.triggers).toEqual([
        {
          id: 'webhook_trigger_1',
          type: TriggerTypeEnum.WEBHOOK_TRIGGER,
          name: 'My Webhook',
          parameters: { url: 'https://example.com' },
        },
      ])
    })

    it('omits trigger name when not provided', () => {
      const triggers: Activity[] = [
        {
          id: 'trigger-1',
          type: TriggerTypeEnum.MANUAL_TRIGGER,
          parameters: {},
        },
      ]

      const result = buildWorkflowDefinition('Test', '', [], triggers, { edges: [] })

      expect(result.triggers[0]).not.toHaveProperty('name')
    })

    it('uses empty config when config is undefined', () => {
      const triggers: Activity[] = [
        {
          id: 'trigger-1',
          type: TriggerTypeEnum.MANUAL_TRIGGER,
          parameters: undefined as unknown as Record<string, unknown>,
        },
      ]

      const result = buildWorkflowDefinition('Test', '', [], triggers, { edges: [] })

      expect(result.triggers[0].parameters).toEqual({})
    })
  })

  describe('Activity (node) mapping', () => {
    it('maps activities with all properties', () => {
      const activities: Activity[] = [
        {
          id: 'task-1',
          type: 'script',
          name: 'My Script',
          parameters: { code: 'print("hello")' },
          settings: { timeout: 300, retry_policy: { max_retries: 3 } },
          outputs: { result: '$.output' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0]).toMatchObject({
        id: 'task-1',
        type: 'script',
        name: 'My Script',
        parameters: { code: 'print("hello")' },
        settings: { timeout: 300, retry_policy: { max_retries: 3 } },
        outputs: { result: '$.output' },
      })
    })

    it('includes inputs when activity has inputs property', () => {
      const activities: Activity[] = [
        {
          id: 'task-1',
          type: 'script',
          parameters: {},
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
          parameters: {},
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
          parameters: {},
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0]).not.toHaveProperty('name')
      expect(result.nodes[0]).not.toHaveProperty('settings')
      expect(result.nodes[0]).not.toHaveProperty('outputs')
    })

    it('includes settings when provided', () => {
      const activities: Activity[] = [
        {
          id: 'task-1',
          type: 'script',
          parameters: {},
          settings: { timeout: 300, continue_on_failure: true },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0]).toHaveProperty('settings', { timeout: 300, continue_on_failure: true })
    })

    it('transforms approval node approver users from objects to string arrays', () => {
      const activities: Activity[] = [
        {
          id: 'approval-1',
          type: 'approval',
          parameters: {
            approver_users: [
              { id: 'user-1', username: 'alice' },
              { id: 'user-2', username: 'bob' },
            ],
          },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].parameters).toEqual({
        approver_users: ['alice', 'bob'],
      })
    })

    it('transforms approval node approver groups from objects to string arrays', () => {
      const activities: Activity[] = [
        {
          id: 'approval-1',
          type: 'approval',
          parameters: {
            approver_groups: [
              { id: 'group-1', name: 'admins' },
              { id: 'group-2', name: 'reviewers' },
            ],
          },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].parameters).toEqual({
        approver_groups: ['admins', 'reviewers'],
      })
    })

    it('transforms both approver users and groups in approval node', () => {
      const activities: Activity[] = [
        {
          id: 'approval-1',
          type: 'approval',
          parameters: {
            approver_users: [{ id: 'user-1', username: 'alice' }],
            approver_groups: [{ id: 'group-1', name: 'admins' }],
            other_field: 'unchanged',
          },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].parameters).toEqual({
        approver_users: ['alice'],
        approver_groups: ['admins'],
        other_field: 'unchanged',
      })
    })

    it('handles approver arrays that are already strings', () => {
      const activities: Activity[] = [
        {
          id: 'approval-1',
          type: 'approval',
          parameters: {
            approver_users: ['alice', 'bob'],
            approver_groups: ['admins'],
          },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].parameters).toEqual({
        approver_users: ['alice', 'bob'],
        approver_groups: ['admins'],
      })
    })

    it('does not transform approvers for non-approval nodes', () => {
      const activities: Activity[] = [
        {
          id: 'script-1',
          type: 'script',
          parameters: {
            approver_users: [{ id: 'user-1', username: 'alice' }],
          },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      // Should remain unchanged for non-approval nodes
      expect(result.nodes[0].parameters).toEqual({
        approver_users: [{ id: 'user-1', username: 'alice' }],
      })
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
          type: TriggerTypeEnum.WEBHOOK_TRIGGER,
          parameters: {},
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
          type: TriggerTypeEnum.WEBHOOK_TRIGGER,
          parameters: {},
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
          type: TriggerTypeEnum.WEBHOOK_TRIGGER,
          parameters: {},
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
        { id: 'trigger_a', type: TriggerTypeEnum.MANUAL_TRIGGER, parameters: {} },
        { id: 'trigger_b', type: TriggerTypeEnum.WEBHOOK_TRIGGER, parameters: {} },
        { id: 'trigger_c', type: TriggerTypeEnum.SCHEDULED, parameters: {} },
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
          type: TriggerTypeEnum.WEBHOOK_TRIGGER,
          name: 'My Webhook',
          parameters: { url: 'https://example.com' },
        },
      ]

      const activities: Activity[] = [
        {
          id: 'loop-1',
          type: 'loop',
          name: 'Process Items',
          parameters: { type: 'for_each', items: '$.items' },
        },
        {
          id: 'task-1',
          type: 'script',
          name: 'Process Item',
          parameters: { code: 'print(item)' },
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
          parameters: { condition: '!(${status} == "completed")' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].parameters.condition).toBe('not (${status} == "completed")')
    })

    it('transforms UI negation syntax (!) to backend syntax (not) for loop nodes', () => {
      const activities: Activity[] = [
        {
          id: 'loop-1',
          type: 'loop',
          name: 'While Loop',
          parameters: { type: 'while', condition: '!(${done} == true)' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].parameters.condition).toBe('not (${done} == true)')
    })

    it('preserves condition expressions without negation', () => {
      const activities: Activity[] = [
        {
          id: 'cond-1',
          type: 'condition',
          name: 'Check Value',
          parameters: { condition: '${value} > 10' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].parameters.condition).toBe('${value} > 10')
    })

    it('handles complex nested expressions with negation', () => {
      const activities: Activity[] = [
        {
          id: 'cond-1',
          type: 'condition',
          name: 'Complex Check',
          parameters: { condition: '!((${a} > 5 && ${b} < 10))' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].parameters.condition).toBe('not ((${a} > 5 and ${b} < 10))')
    })

    it('does not transform non-condition/loop node configs', () => {
      const activities: Activity[] = [
        {
          id: 'script-1',
          type: 'script',
          name: 'Script',
          parameters: { code: 'if !done: pass' }, // Python code with !, not a condition expression
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      expect(result.nodes[0].parameters.code).toBe('if !done: pass')
    })

    it('handles condition expressions that are already in backend format', () => {
      const activities: Activity[] = [
        {
          id: 'cond-1',
          type: 'condition',
          name: 'Check',
          parameters: { condition: 'not (${value} == "test")' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      // Should remain in backend format
      expect(result.nodes[0].parameters.condition).toBe('not (${value} == "test")')
    })

    it('transforms "contains" operator to Python "in" operator with reversed operands', () => {
      const activities: Activity[] = [
        {
          id: 'cond1',
          type: 'condition',
          name: 'Check Message',
          parameters: { condition: '${message.text} contains "Hello"' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      // UI: ${message.text} contains "Hello"
      // Backend: "Hello" in ${message.text}
      expect(result.nodes[0].parameters.condition).toBe('"Hello" in ${message.text}')
    })

    it('transforms negated "contains" to "not in" operator', () => {
      const activities: Activity[] = [
        {
          id: 'cond1',
          type: 'condition',
          name: 'Check No Spam',
          parameters: { condition: '!(${email.body} contains "spam")' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      // UI: !(${email.body} contains "spam")
      // Backend: "spam" not in ${email.body}
      expect(result.nodes[0].parameters.condition).toBe('"spam" not in ${email.body}')
    })

    it('transforms "contains" in complex expressions', () => {
      const activities: Activity[] = [
        {
          id: 'cond1',
          type: 'condition',
          name: 'Complex Check',
          parameters: { condition: '${age} >= 18 && ${name} contains "Smith"' },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      // Should transform both && to 'and' and 'contains' to 'in'
      expect(result.nodes[0].parameters.condition).toBe('(${age} >= 18 and "Smith" in ${name})')
    })

    it('transforms switch case conditions from UI to backend format', () => {
      const activities: Activity[] = [
        {
          id: 'switch-1',
          type: 'switch',
          name: 'Route',
          parameters: {
            cases: [
              { port: 'case_0', label: 'Path 1', condition: '!(${status} == "blocked")' },
              { port: 'case_1', label: 'Path 2', condition: '${priority} > 5' },
            ],
            default_port: 'default',
          },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      const cases = result.nodes[0].parameters.cases as Array<{ condition: string }>
      expect(cases[0].condition).toBe('not (${status} == "blocked")')
      expect(cases[1].condition).toBe('${priority} > 5')
    })

    it('transforms switch case conditions with contains operator', () => {
      const activities: Activity[] = [
        {
          id: 'switch-1',
          type: 'switch',
          name: 'Route',
          parameters: {
            cases: [{ port: 'case_0', label: 'Path 1', condition: '${name} contains "admin"' }],
            default_port: 'default',
          },
        },
      ]

      const result = buildWorkflowDefinition('Test', '', activities, [], { edges: [] })

      const cases = result.nodes[0].parameters.cases as Array<{ condition: string }>
      expect(cases[0].condition).toBe('"admin" in ${name}')
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
      const triggers: Activity[] = [{ id: 'trigger_1', type: TriggerTypeEnum.MANUAL_TRIGGER, parameters: {} }]
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
