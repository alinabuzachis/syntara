import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { buildNestedConditionStructure } from './buildNestedStructure'
import { flattenConditionStructure } from './flattenConditionStructure'
import { generateEdgesFromStructure } from './generateEdgesFromStructure'

/**
 * Integration tests for the full condition node workflow:
 * 1. Load nested structure from API
 * 2. Flatten for editing (generateEdges + flatten)
 * 3. Save back to API (buildNested)
 * 4. Verify round-trip preserves structure
 */
describe('Condition Node Integration', () => {
  describe('Simple condition round-trip', () => {
    it('preserves simple condition with then branch', () => {
      // Simulates a workflow from the API with nested structure
      const nestedWorkflow: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
            },
          ],
          else: [],
        },
      ]

      // Step 1: Load from API - generate edges and flatten
      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      // Verify flat structure
      expect(flatActivities).toHaveLength(2)
      expect(flatActivities[0].id).toBe('A')
      expect((flatActivities[0] as Extract<Activity, { type: 'condition' }>).then).toEqual([])
      expect(flatActivities[1].id).toBe('B')

      // Verify edges captured the relationship
      expect(edges).toHaveLength(1)
      expect(edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
        sourceHandle: 'true',
        targetHandle: 'target',
      })

      // Step 2: Save to API - rebuild nested structure
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      // Verify round-trip preserves structure
      expect(rebuiltNested).toHaveLength(1)
      expect(rebuiltNested[0].type).toBe('condition')
      const condition = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.then).toHaveLength(1)
      expect(condition.then[0].id).toBe('B')
    })

    it('preserves condition with then and else branches', () => {
      const nestedWorkflow: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
            },
          ],
          else: [
            {
              type: 'task',
              id: 'C',
              name: 'Task C',
              task: { executor: 'script', config: { language: 'python', code: 'print("C")' } },
            },
          ],
        },
      ]

      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      // Verify edges for both branches
      expect(edges).toHaveLength(2)
      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'A' && e.target === 'C' && e.sourceHandle === 'false')).toBe(true)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(1)
      const condition = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.then).toHaveLength(1)
      expect(condition.then[0].id).toBe('B')
      expect(condition.else).toHaveLength(1)
      expect(condition.else![0].id).toBe('C')
    })
  })

  describe('Nested conditions round-trip', () => {
    it('preserves nested condition inside then branch', () => {
      const nestedWorkflow: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.a > 10',
          then: [
            {
              type: 'condition',
              id: 'B',
              name: 'Condition B',
              condition: 'input.b > 20',
              then: [
                {
                  type: 'task',
                  id: 'C',
                  name: 'Task C',
                  task: { executor: 'script', config: { language: 'python', code: 'print("C")' } },
                },
              ],
              else: [],
            },
          ],
          else: [],
        },
      ]

      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      // Verify all activities are flat
      expect(flatActivities).toHaveLength(3)
      expect(flatActivities.map((a) => a.id)).toEqual(['A', 'B', 'C'])

      // Verify edges capture the nesting
      expect(edges).toHaveLength(2)
      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'B' && e.target === 'C' && e.sourceHandle === 'true')).toBe(true)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(1)
      const conditionA = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(conditionA.id).toBe('A')
      expect(conditionA.then).toHaveLength(1)

      const conditionB = conditionA.then[0] as Extract<Activity, { type: 'condition' }>
      expect(conditionB.id).toBe('B')
      expect(conditionB.then).toHaveLength(1)
      expect(conditionB.then[0].id).toBe('C')
    })

    it('preserves sequential activities in condition branches', () => {
      const nestedWorkflow: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [
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
          else: [],
        },
      ]

      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      // Verify edges include condition edge and sequential edges
      // Note: generateEdgesFromStructure may create edges at multiple levels due to recursion
      expect(edges.length).toBeGreaterThanOrEqual(2)
      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'B' && e.target === 'C' && e.sourceHandle === 'source')).toBe(true)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      const condition = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.then).toHaveLength(2)
      expect(condition.then[0].id).toBe('B')
      expect(condition.then[1].id).toBe('C')
    })
  })

  describe('Conditions with parallel_for_* wrappers', () => {
    it('preserves parallel_for_* wrapper in condition branch', () => {
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

      const nestedWorkflow: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [parallelWrapper],
          else: [],
        },
        {
          type: 'join',
          id: 'J',
          name: 'Join J',
          join: { strategy: 'all' },
        },
      ]

      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      // Verify edges connect condition to branches (not wrapper)
      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'A' && e.target === 'C' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'B' && e.target === 'J')).toBe(true)
      expect(edges.some((e) => e.source === 'C' && e.target === 'J')).toBe(true)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(2)
      const condition = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.then).toHaveLength(1)

      // Should include the parallel wrapper, not individual branches
      const wrapper = condition.then[0] as Extract<Activity, { type: 'parallel' }>
      expect(wrapper.type).toBe('parallel')
      expect(wrapper.id).toBe('parallel_for_J')
      expect(wrapper.branches).toHaveLength(2)
    })

    it('preserves nested condition inside parallel_for_* wrapper', () => {
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
            then: [
              {
                type: 'task',
                id: 'D',
                name: 'Task D',
                task: { executor: 'script', config: { language: 'python', code: 'print("D")' } },
              },
            ],
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

      const nestedWorkflow: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.a > 10',
          then: [parallelWrapper],
          else: [],
        },
        {
          type: 'join',
          id: 'J',
          name: 'Join J',
          join: { strategy: 'all' },
        },
      ]

      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      // Verify all nodes are properly represented
      expect(flatActivities.some((a) => a.id === 'A')).toBe(true)
      expect(flatActivities.some((a) => a.id === 'parallel_for_J')).toBe(true)
      expect(flatActivities.some((a) => a.id === 'J')).toBe(true)

      // Verify nested condition inside wrapper has edges
      expect(edges.some((e) => e.source === 'B' && e.target === 'D' && e.sourceHandle === 'true')).toBe(true)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(2)
      const conditionA = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(conditionA.then).toHaveLength(1)

      const wrapper = conditionA.then[0] as Extract<Activity, { type: 'parallel' }>
      expect(wrapper.type).toBe('parallel')
      expect(wrapper.id).toBe('parallel_for_J')
      expect(wrapper.branches).toHaveLength(2)

      // Verify nested condition preserved inside wrapper
      const conditionB = wrapper.branches![0] as Extract<Activity, { type: 'condition' }>
      expect(conditionB.type).toBe('condition')
      expect(conditionB.id).toBe('B')
    })
  })

  describe('Complex workflows', () => {
    it('handles condition after sequential tasks', () => {
      const nestedWorkflow: Activity[] = [
        {
          type: 'task',
          id: 'T1',
          name: 'Task 1',
          task: { executor: 'script', config: { language: 'python', code: 'print("1")' } },
        },
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
            },
          ],
          else: [],
        },
      ]

      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      // Should have sequential edge from T1 to A, and condition edge from A to B
      expect(edges).toHaveLength(2)
      expect(edges.some((e) => e.source === 'T1' && e.target === 'A' && e.sourceHandle === 'source')).toBe(true)
      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(2)
      expect(rebuiltNested[0].id).toBe('T1')
      expect(rebuiltNested[1].id).toBe('A')
    })

    it('handles multiple independent conditions', () => {
      const nestedWorkflow: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.a > 10',
          then: [
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
            },
          ],
          else: [],
        },
        {
          type: 'condition',
          id: 'C',
          name: 'Condition C',
          condition: 'input.c > 20',
          then: [],
          else: [
            {
              type: 'task',
              id: 'D',
              name: 'Task D',
              task: { executor: 'script', config: { language: 'python', code: 'print("D")' } },
            },
          ],
        },
      ]

      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      expect(flatActivities).toHaveLength(4)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(2)

      const conditionA = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(conditionA.id).toBe('A')
      expect(conditionA.then).toHaveLength(1)
      expect(conditionA.then[0].id).toBe('B')

      const conditionC = rebuiltNested[1] as Extract<Activity, { type: 'condition' }>
      expect(conditionC.id).toBe('C')
      expect(conditionC.else).toHaveLength(1)
      expect(conditionC.else![0].id).toBe('D')
    })
  })

  describe('Edge cases', () => {
    it('handles empty condition branches', () => {
      const nestedWorkflow: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [],
          else: [],
        },
      ]

      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      expect(flatActivities).toHaveLength(1)
      expect(edges).toHaveLength(0)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(1)
      const condition = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.then).toEqual([])
      expect(condition.else).toBeUndefined()
    })

    it('preserves activity metadata through round-trip', () => {
      const nestedWorkflow: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          outputs: { result: 'string' },
          then: [
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
              outputs: { value: 'number' },
            },
          ],
          else: [],
        },
      ]

      const edges = generateEdgesFromStructure(nestedWorkflow)
      const flatActivities = flattenConditionStructure(nestedWorkflow)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      const condition = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.outputs).toEqual({ result: 'string' })
      expect(condition.then[0].outputs).toEqual({ value: 'number' })
    })
  })
})
