import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { EdgeConnection } from '../workflowTransform'
import { WorkflowTransform } from '../workflowTransform'

describe('WorkflowTransform - Loop Nesting', () => {
  it('nests simple loop with single activity in body', () => {
    const activities: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Trigger', task: { executor: 'manual', config: {} } },
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      {
        type: 'loop',
        id: 'L',
        name: 'Loop L',
        loop: { over: '${items}', item: 'item', do: [] },
      },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'trigger-A', source: 'trigger', target: 'A', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A-L', source: 'A', target: 'L', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'L-B', source: 'L', target: 'B', sourceHandle: 'loop', targetHandle: 'target' },
      { id: 'B-L', source: 'B', target: 'L', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 3 top-level activities: trigger, A, L
    expect(result).toHaveLength(3)

    // Find the loop node
    const loopNode = result.find((a) => a.id === 'L') as Extract<Activity, { type: 'loop' }>
    expect(loopNode).toBeDefined()
    expect(loopNode.type).toBe('loop')

    // Loop should contain B in its do array
    expect(loopNode.loop.do).toHaveLength(1)
    expect(loopNode.loop.do[0].id).toBe('B')
  })

  it('nests loop with multiple activities in body', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'L',
        name: 'Loop L',
        loop: { over: '${items}', item: 'item', do: [] },
      },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'C', name: 'Task C', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'L-B', source: 'L', target: 'B', sourceHandle: 'loop', targetHandle: 'target' },
      { id: 'B-C', source: 'B', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'C-L', source: 'C', target: 'L', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 1 top-level activity: L
    expect(result).toHaveLength(1)

    // Find the loop node
    const loopNode = result[0] as Extract<Activity, { type: 'loop' }>
    expect(loopNode.type).toBe('loop')

    // Loop should contain B and C in its do array
    expect(loopNode.loop.do).toHaveLength(2)
    expect(loopNode.loop.do[0].id).toBe('B')
    expect(loopNode.loop.do[1].id).toBe('C')
  })

  it('handles loop with no body (empty do array)', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'L',
        name: 'Loop L',
        loop: { over: '${items}', item: 'item', do: [] },
      },
    ]

    const edges: EdgeConnection[] = []

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 1 top-level activity: L
    expect(result).toHaveLength(1)

    // Loop should have empty do array
    const loopNode = result[0] as Extract<Activity, { type: 'loop' }>
    expect(loopNode.type).toBe('loop')
    expect(loopNode.loop.do).toHaveLength(0)
  })

  it('handles nested loops', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'L1',
        name: 'Outer Loop',
        loop: { over: '${items}', item: 'item', do: [] },
      },
      {
        type: 'loop',
        id: 'L2',
        name: 'Inner Loop',
        loop: { over: '${subitems}', item: 'subitem', do: [] },
      },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'L1-L2', source: 'L1', target: 'L2', sourceHandle: 'loop', targetHandle: 'target' },
      { id: 'L2-B', source: 'L2', target: 'B', sourceHandle: 'loop', targetHandle: 'target' },
      { id: 'B-L2', source: 'B', target: 'L2', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'L2-L1', source: 'L2', target: 'L1', sourceHandle: 'done', targetHandle: 'target' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 1 top-level activity: L1
    expect(result).toHaveLength(1)

    // Outer loop should contain L2
    const outerLoop = result[0] as Extract<Activity, { type: 'loop' }>
    expect(outerLoop.type).toBe('loop')
    expect(outerLoop.loop.do).toHaveLength(1)

    // Inner loop should contain B
    const innerLoop = outerLoop.loop.do[0] as Extract<Activity, { type: 'loop' }>
    expect(innerLoop.type).toBe('loop')
    expect(innerLoop.loop.do).toHaveLength(1)
    expect(innerLoop.loop.do[0].id).toBe('B')
  })

  it('round-trip: flatten → nest preserves loop structure', () => {
    const originalNested: Activity[] = [
      {
        type: 'loop',
        id: 'L',
        name: 'Loop L',
        loop: {
          over: '${items}',
          item: 'item',
          do: [
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
            {
              type: 'task',
              id: 'C',
              name: 'Task C',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
        },
      },
    ]

    // Flatten
    const { activities: flat, edges } = WorkflowTransform.flatten(originalNested)

    // Should have 3 flat activities
    expect(flat).toHaveLength(3)
    expect(flat.map((a) => a.id).sort()).toEqual(['B', 'C', 'L'])

    // Loop node should have empty do array
    const flatLoop = flat.find((a) => a.id === 'L') as Extract<Activity, { type: 'loop' }>
    expect(flatLoop.loop.do).toHaveLength(0)

    // Should have edges: L->B, B->C, C->L
    expect(edges).toHaveLength(3)
    expect(edges.find((e) => e.source === 'L' && e.target === 'B')).toBeDefined()
    expect(edges.find((e) => e.source === 'B' && e.target === 'C')).toBeDefined()
    expect(edges.find((e) => e.source === 'C' && e.target === 'L')).toBeDefined()

    // Nest back
    const nested = WorkflowTransform.nest(flat, edges)

    // Should match original structure
    expect(nested).toHaveLength(1)
    const loopNode = nested[0] as Extract<Activity, { type: 'loop' }>
    expect(loopNode.type).toBe('loop')
    expect(loopNode.loop.do).toHaveLength(2)
    expect(loopNode.loop.do[0].id).toBe('B')
    expect(loopNode.loop.do[1].id).toBe('C')
  })

  it('handles loop with condition in body', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'L',
        name: 'Loop L',
        loop: { over: '${items}', item: 'item', do: [] },
      },
      {
        type: 'condition',
        id: 'Cond',
        name: 'Condition',
        condition: '${item.enabled}',
        then: [],
        else: [],
      },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'C', name: 'Task C', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'L-Cond', source: 'L', target: 'Cond', sourceHandle: 'loop', targetHandle: 'target' },
      { id: 'Cond-B', source: 'Cond', target: 'B', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'Cond-C', source: 'Cond', target: 'C', sourceHandle: 'false', targetHandle: 'target' },
      { id: 'B-L', source: 'B', target: 'L', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'C-L', source: 'C', target: 'L', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 1 top-level activity: L
    expect(result).toHaveLength(1)

    // Loop should contain the condition
    const loopNode = result[0] as Extract<Activity, { type: 'loop' }>
    expect(loopNode.type).toBe('loop')
    expect(loopNode.loop.do).toHaveLength(1)

    // Condition should have B in then and C in else
    const condNode = loopNode.loop.do[0] as Extract<Activity, { type: 'condition' }>
    expect(condNode.type).toBe('condition')
    expect(condNode.then).toHaveLength(1)
    expect(condNode.then![0].id).toBe('B')
    expect(condNode.else).toHaveLength(1)
    expect(condNode.else![0].id).toBe('C')
  })
})
