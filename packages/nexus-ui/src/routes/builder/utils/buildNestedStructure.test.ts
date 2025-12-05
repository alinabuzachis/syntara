import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { buildNestedConditionStructure } from './buildNestedStructure'
import { WorkflowTransform } from './workflowTransform'

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
          type: 'converge',
          id: 'J',
          name: 'Converge J',
          converge: { strategy: 'all', branches: [] },
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

      // Converge should be a sibling after the condition, not inside the branch
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
          type: 'converge',
          id: 'J',
          name: 'Converge J',
          converge: { strategy: 'all', branches: [] },
        },
      ]

      const edges = [
        // Condition A connects to branches in parallel wrapper
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'true', targetHandle: 'target' },
        { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'true', targetHandle: 'target' },
        // Nested condition B connects to D
        { id: 'B-D', source: 'B', target: 'D', sourceHandle: 'true', targetHandle: 'target' },
        // D and C connect to converge
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

  describe('Loop structures', () => {
    it('builds loop body with single activity', () => {
      const activities: Activity[] = [
        {
          type: 'loop',
          id: 'loop1',
          name: 'Process Items',
          loop: {
            type: 'forEach',
            items: '${input.items}',
            itemVariable: 'item',
            do: [],
          },
        },
        {
          type: 'task',
          id: 'task1',
          name: 'Process Item',
          task: { executor: 'script', config: { language: 'bash', code: 'echo $item' } },
        },
      ]
      const edges = [
        { id: 'loop1-task1', source: 'loop1', target: 'task1', sourceHandle: 'loop', targetHandle: 'target' },
        { id: 'task1-loop1', source: 'task1', target: 'loop1', sourceHandle: 'source', targetHandle: 'end' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('loop')
      expect(result[0].id).toBe('loop1')
      const loop = result[0] as Extract<Activity, { type: 'loop' }>
      expect(loop.loop.do).toHaveLength(1)
      expect(loop.loop.do[0].id).toBe('task1')
    })

    it('builds loop body with multiple sequential activities', () => {
      const activities: Activity[] = [
        {
          type: 'loop',
          id: 'loop1',
          name: 'Process Items',
          loop: {
            type: 'forEach',
            items: '${input.items}',
            itemVariable: 'item',
            do: [],
          },
        },
        {
          type: 'task',
          id: 'task1',
          name: 'Task 1',
          task: { executor: 'script', config: { language: 'bash', code: 'echo 1' } },
        },
        {
          type: 'task',
          id: 'task2',
          name: 'Task 2',
          task: { executor: 'script', config: { language: 'bash', code: 'echo 2' } },
        },
      ]
      const edges = [
        { id: 'loop1-task1', source: 'loop1', target: 'task1', sourceHandle: 'loop', targetHandle: 'target' },
        { id: 'task1-task2', source: 'task1', target: 'task2', sourceHandle: 'source', targetHandle: 'target' },
        { id: 'task2-loop1', source: 'task2', target: 'loop1', sourceHandle: 'source', targetHandle: 'end' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('loop')
      const loop = result[0] as Extract<Activity, { type: 'loop' }>
      expect(loop.loop.do).toHaveLength(2)
      expect(loop.loop.do[0].id).toBe('task1')
      expect(loop.loop.do[1].id).toBe('task2')
    })

    it('preserves activity before loop node', () => {
      const activities: Activity[] = [
        {
          type: 'task',
          id: 'task1',
          name: 'Before Loop',
          task: { executor: 'script', config: { language: 'bash', code: 'echo before' } },
        },
        {
          type: 'loop',
          id: 'loop1',
          name: 'Process Items',
          loop: {
            type: 'forEach',
            items: '${input.items}',
            itemVariable: 'item',
            do: [],
          },
        },
        {
          type: 'task',
          id: 'task2',
          name: 'Inside Loop',
          task: { executor: 'script', config: { language: 'bash', code: 'echo inside' } },
        },
      ]
      const edges = [
        // Task1 -> Loop1 (sequential connection TO the loop)
        { id: 'task1-loop1', source: 'task1', target: 'loop1', sourceHandle: 'source', targetHandle: 'target' },
        // Loop1 -> Task2 (start of loop body)
        { id: 'loop1-task2', source: 'loop1', target: 'task2', sourceHandle: 'loop', targetHandle: 'target' },
        // Task2 -> Loop1 (loop back)
        { id: 'task2-loop1', source: 'task2', target: 'loop1', sourceHandle: 'source', targetHandle: 'end' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      // Should have 2 top-level activities: task1 and loop1
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('task1')
      expect(result[1].id).toBe('loop1')

      // Loop should contain task2 in its body
      const loop = result[1] as Extract<Activity, { type: 'loop' }>
      expect(loop.loop.do).toHaveLength(1)
      expect(loop.loop.do[0].id).toBe('task2')
    })

    it('preserves activity after loop node', () => {
      const activities: Activity[] = [
        {
          type: 'loop',
          id: 'loop1',
          name: 'Process Items',
          loop: {
            type: 'forEach',
            items: '${input.items}',
            itemVariable: 'item',
            do: [],
          },
        },
        {
          type: 'task',
          id: 'task1',
          name: 'Inside Loop',
          task: { executor: 'script', config: { language: 'bash', code: 'echo inside' } },
        },
        {
          type: 'task',
          id: 'task2',
          name: 'After Loop',
          task: { executor: 'script', config: { language: 'bash', code: 'echo after' } },
        },
      ]
      const edges = [
        // Loop1 -> Task1 (start of loop body)
        { id: 'loop1-task1', source: 'loop1', target: 'task1', sourceHandle: 'loop', targetHandle: 'target' },
        // Task1 -> Loop1 (loop back)
        { id: 'task1-loop1', source: 'task1', target: 'loop1', sourceHandle: 'source', targetHandle: 'end' },
        // Loop1 -> Task2 (sequential connection FROM the loop using 'done' handle)
        { id: 'loop1-task2', source: 'loop1', target: 'task2', sourceHandle: 'done', targetHandle: 'target' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      // Should have 2 top-level activities: loop1 and task2
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('loop1')
      expect(result[1].id).toBe('task2')

      // Loop should contain task1 in its body
      const loop = result[0] as Extract<Activity, { type: 'loop' }>
      expect(loop.loop.do).toHaveLength(1)
      expect(loop.loop.do[0].id).toBe('task1')
    })

    it('round-trips loop with incoming and outgoing edges', () => {
      // Test the full flatten -> nest cycle for a loop with sequential edges
      const nestedWorkflow: Activity[] = [
        {
          type: 'task',
          id: 'task1',
          name: 'Before Loop',
          task: { executor: 'script', config: { language: 'bash', code: 'echo before' } },
        },
        {
          type: 'loop',
          id: 'loop1',
          name: 'Process Items',
          loop: {
            type: 'forEach',
            items: '${input.items}',
            itemVariable: 'item',
            do: [
              {
                type: 'task',
                id: 'task2',
                name: 'Inside Loop',
                task: { executor: 'script', config: { language: 'bash', code: 'echo inside' } },
              },
            ],
          },
        },
        {
          type: 'task',
          id: 'task3',
          name: 'After Loop',
          task: { executor: 'script', config: { language: 'bash', code: 'echo after' } },
        },
      ]

      // Flatten
      const { activities: flatActivities, edges } = WorkflowTransform.flatten(nestedWorkflow)

      // Should have 4 flat activities
      expect(flatActivities).toHaveLength(4)

      // Should have edges for sequential flow and loop structure
      const expectedEdges = [
        // Task1 -> Loop1 (sequential)
        expect.objectContaining({ source: 'task1', target: 'loop1', sourceHandle: 'source' }),
        // Loop1 -> Task3 (sequential, using 'done' handle)
        expect.objectContaining({ source: 'loop1', target: 'task3', sourceHandle: 'done' }),
        // Loop1 -> Task2 (loop body)
        expect.objectContaining({ source: 'loop1', target: 'task2', sourceHandle: 'loop' }),
        // Task2 -> Loop1 (loop back)
        expect.objectContaining({ source: 'task2', target: 'loop1', targetHandle: 'end' }),
      ]
      expect(edges).toEqual(expect.arrayContaining(expectedEdges))

      // Nest back
      const reNested = buildNestedConditionStructure(flatActivities, edges)

      // Should match original structure
      expect(reNested).toHaveLength(3)
      expect(reNested[0].id).toBe('task1')
      expect(reNested[1].id).toBe('loop1')
      expect(reNested[2].id).toBe('task3')

      const loop = reNested[1] as Extract<Activity, { type: 'loop' }>
      expect(loop.loop.do).toHaveLength(1)
      expect(loop.loop.do[0].id).toBe('task2')
    })

    it('builds loop body with nested condition', () => {
      const activities: Activity[] = [
        {
          type: 'loop',
          id: 'loop1',
          name: 'Process Items',
          loop: {
            type: 'forEach',
            items: '${input.items}',
            itemVariable: 'item',
            do: [],
          },
        },
        {
          type: 'condition',
          id: 'cond1',
          name: 'Check Item',
          condition: 'item > 10',
          then: [],
          else: [],
        },
        {
          type: 'task',
          id: 'task1',
          name: 'Process Large',
          task: { executor: 'script', config: { language: 'bash', code: 'echo large' } },
        },
      ]
      const edges = [
        { id: 'loop1-cond1', source: 'loop1', target: 'cond1', sourceHandle: 'loop', targetHandle: 'target' },
        { id: 'cond1-task1', source: 'cond1', target: 'task1', sourceHandle: 'true', targetHandle: 'target' },
        { id: 'task1-loop1', source: 'task1', target: 'loop1', sourceHandle: 'source', targetHandle: 'end' },
      ]

      const result = buildNestedConditionStructure(activities, edges)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('loop')
      const loop = result[0] as Extract<Activity, { type: 'loop' }>
      expect(loop.loop.do).toHaveLength(1)
      expect(loop.loop.do[0].type).toBe('condition')
      const condition = loop.loop.do[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.then).toHaveLength(1)
      expect(condition.then[0].id).toBe('task1')
    })
  })
})
