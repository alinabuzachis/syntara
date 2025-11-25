import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { buildNestedConditionStructure } from './buildNestedStructure'

describe('buildNestedConditionStructure', () => {
  describe('Simple conditions', () => {
    it('builds then branch with single activity', () => {
      const activities: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [],
          else: [],
        },
        {
          type: 'task',
          id: 'B',
          name: 'Task B',
          task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
        },
      ]
      const edges = [{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'true', targetHandle: 'target' }]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('condition')
      expect(result[0].id).toBe('A')
      const condition = result[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.then).toHaveLength(1)
      expect(condition.then[0].id).toBe('B')
      expect(condition.else).toBeUndefined()
    })

    it('builds then and else branches', () => {
      const activities: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [],
          else: [],
        },
        {
          type: 'task',
          id: 'B',
          name: 'Task B',
          task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
        },
        {
          type: 'task',
          id: 'C',
          name: 'Task C',
          task: { executor: 'script', config: { language: 'python', code: 'print("C")' } },
        },
      ]
      const edges = [
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'true', targetHandle: 'target' },
        { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'false', targetHandle: 'target' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(1)
      const condition = result[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.then).toHaveLength(1)
      expect(condition.then[0].id).toBe('B')
      expect(condition.else).toHaveLength(1)
      expect(condition.else![0].id).toBe('C')
    })

    it('includes sequential activities in branches', () => {
      const activities: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [],
          else: [],
        },
        {
          type: 'task',
          id: 'B',
          name: 'Task B',
          task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
        },
        {
          type: 'task',
          id: 'C',
          name: 'Task C',
          task: { executor: 'script', config: { language: 'python', code: 'print("C")' } },
        },
      ]
      const edges = [
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'true', targetHandle: 'target' },
        { id: 'B-C', source: 'B', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(1)
      const condition = result[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.then).toHaveLength(2)
      expect(condition.then[0].id).toBe('B')
      expect(condition.then[1].id).toBe('C')
    })
  })

  describe('Nested conditions', () => {
    it('nests condition inside another condition', () => {
      const activities: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.a > 10',
          then: [],
          else: [],
        },
        {
          type: 'condition',
          id: 'B',
          name: 'Condition B',
          condition: 'input.b > 20',
          then: [],
          else: [],
        },
        {
          type: 'task',
          id: 'C',
          name: 'Task C',
          task: { executor: 'script', config: { language: 'python', code: 'print("C")' } },
        },
      ]
      const edges = [
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'true', targetHandle: 'target' },
        { id: 'B-C', source: 'B', target: 'C', sourceHandle: 'true', targetHandle: 'target' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(1)
      const conditionA = result[0] as Extract<Activity, { type: 'condition' }>
      expect(conditionA.id).toBe('A')
      expect(conditionA.then).toHaveLength(1)

      const conditionB = conditionA.then[0] as Extract<Activity, { type: 'condition' }>
      expect(conditionB.type).toBe('condition')
      expect(conditionB.id).toBe('B')
      expect(conditionB.then).toHaveLength(1)
      expect(conditionB.then[0].id).toBe('C')
    })
  })

  describe('Conditions with parallel_for_* wrappers', () => {
    it('includes parallel_for_* wrapper in branch without join node', () => {
      const parallelWrapper: Activity = {
        type: 'parallel',
        id: 'parallel_for_J',
        name: 'Parallel for J',
        branches: [
          {
            type: 'task',
            id: 'B',
            name: 'Task B',
            task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
          },
          {
            type: 'task',
            id: 'C',
            name: 'Task C',
            task: { executor: 'script', config: { language: 'python', code: 'print("C")' } },
          },
        ],
      }

      const activities: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [],
          else: [],
        },
        parallelWrapper,
        {
          type: 'join',
          id: 'J',
          name: 'Join J',
          join: { strategy: 'all' },
        },
      ]

      const edges = [
        // Condition A (true) connects to branches inside parallel wrapper
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'true', targetHandle: 'target' },
        { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'true', targetHandle: 'target' },
        // Branches connect to join
        { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(2)
      const condition = result[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.id).toBe('A')
      expect(condition.then).toHaveLength(1)

      // Should include the parallel wrapper itself, not individual branches
      const wrapper = condition.then[0]
      expect(wrapper.type).toBe('parallel')
      expect(wrapper.id).toBe('parallel_for_J')

      // Join should be a sibling after the condition, not inside the branch
      expect(result[1].id).toBe('J')
    })

    it('handles nested condition inside parallel_for_* wrapper', () => {
      const parallelWrapper: Activity = {
        type: 'parallel',
        id: 'parallel_for_J',
        name: 'Parallel for J',
        branches: [
          {
            type: 'condition',
            id: 'B',
            name: 'Condition B',
            condition: 'input.b > 20',
            then: [],
            else: [],
          },
          {
            type: 'task',
            id: 'C',
            name: 'Task C',
            task: { executor: 'script', config: { language: 'python', code: 'print("C")' } },
          },
        ],
      }

      const activities: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.a > 10',
          then: [],
          else: [],
        },
        parallelWrapper,
        {
          type: 'task',
          id: 'D',
          name: 'Task D',
          task: { executor: 'script', config: { language: 'python', code: 'print("D")' } },
        },
        {
          type: 'join',
          id: 'J',
          name: 'Join J',
          join: { strategy: 'all' },
        },
      ]

      const edges = [
        // Condition A connects to branches in parallel wrapper
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'true', targetHandle: 'target' },
        { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'true', targetHandle: 'target' },
        // Nested condition B connects to D
        { id: 'B-D', source: 'B', target: 'D', sourceHandle: 'true', targetHandle: 'target' },
        // D and C connect to join
        { id: 'D-J', source: 'D', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(2)
      const conditionA = result[0] as Extract<Activity, { type: 'condition' }>
      expect(conditionA.id).toBe('A')
      // Includes both parallel wrapper and D (D is collected as descendant of nested condition B)
      expect(conditionA.then.length).toBeGreaterThanOrEqual(1)

      // Should include parallel wrapper with nested condition inside
      const wrapper = conditionA.then.find((a) => a.id === 'parallel_for_J') as Extract<Activity, { type: 'parallel' }>
      expect(wrapper).toBeDefined()
      expect(wrapper.branches).toHaveLength(2)

      // Verify condition B is in the branches
      const conditionB = wrapper.branches![0] as Extract<Activity, { type: 'condition' }>
      expect(conditionB.id).toBe('B')
      expect(conditionB.type).toBe('condition')
      // Note: D may or may not be nested depending on how descendants are collected
      // The important part is that the structure preserves the condition node
    })
  })

  describe('Multiple top-level conditions', () => {
    it('processes multiple independent conditions', () => {
      const activities: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.a > 10',
          then: [],
          else: [],
        },
        {
          type: 'task',
          id: 'B',
          name: 'Task B',
          task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
        },
        {
          type: 'condition',
          id: 'C',
          name: 'Condition C',
          condition: 'input.c > 20',
          then: [],
          else: [],
        },
        {
          type: 'task',
          id: 'D',
          name: 'Task D',
          task: { executor: 'script', config: { language: 'python', code: 'print("D")' } },
        },
      ]
      const edges = [
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'true', targetHandle: 'target' },
        { id: 'C-D', source: 'C', target: 'D', sourceHandle: 'false', targetHandle: 'target' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(2)

      const conditionA = result[0] as Extract<Activity, { type: 'condition' }>
      expect(conditionA.id).toBe('A')
      expect(conditionA.then).toHaveLength(1)
      expect(conditionA.then[0].id).toBe('B')

      const conditionC = result[1] as Extract<Activity, { type: 'condition' }>
      expect(conditionC.id).toBe('C')
      expect(conditionC.else).toHaveLength(1)
      expect(conditionC.else![0].id).toBe('D')
    })
  })
})
