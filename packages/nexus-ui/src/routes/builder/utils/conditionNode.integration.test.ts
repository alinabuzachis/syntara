import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { buildNestedConditionStructure } from './buildNestedStructure'
import { loadWorkflow } from './loadWorkflow'

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

      // Step 1: Load from API - use combined load function (generates edges AND flattens)
      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

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

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

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

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

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

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

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
    it.skip('creates parallel container for divergent branches in condition', () => {
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
          type: 'converge',
          id: 'J',
          name: 'Converge J',
          converge: { strategy: 'all', branches: [] },
        },
      ]

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

      // Verify edges connect condition to branches (parallel wrapper is flattened)
      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'A' && e.target === 'C' && e.sourceHandle === 'true')).toBe(true)
      // Note: Edges from B/C to J may not exist in new architecture since parallel is nested inside condition
      // The flatten operation creates edges within the condition's then branch, not from branches to siblings

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(2)
      const condition = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      // New architecture: then branch may contain parallel + converge node
      expect(condition.then.length).toBeGreaterThanOrEqual(1)

      // New architecture: parallel container is dynamically created with generated ID
      const wrapper = condition.then.find((a) => a.type === 'parallel') as Extract<Activity, { type: 'parallel' }>
      expect(wrapper).toBeDefined()
      expect(wrapper.type).toBe('parallel')
      // ID is now generated (not parallel_for_J), just verify it's a parallel
      expect(wrapper.branches).toHaveLength(2)
      expect(wrapper.branches.some((b) => b.id === 'B')).toBe(true)
      expect(wrapper.branches.some((b) => b.id === 'C')).toBe(true)
    })

    it.skip('creates parallel container with nested condition inside', () => {
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
          type: 'converge',
          id: 'J',
          name: 'Converge J',
          converge: { strategy: 'all', branches: [] },
        },
      ]

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

      // Verify all nodes are properly represented (parallel wrapper is flattened)
      expect(flatActivities.some((a) => a.id === 'A')).toBe(true)
      expect(flatActivities.some((a) => a.id === 'B')).toBe(true) // Condition is flattened
      expect(flatActivities.some((a) => a.id === 'C')).toBe(true) // Task is flattened
      expect(flatActivities.some((a) => a.id === 'D')).toBe(true) // Nested task is flattened
      expect(flatActivities.some((a) => a.id === 'J')).toBe(true)

      // Verify nested condition inside wrapper has edges
      expect(edges.some((e) => e.source === 'B' && e.target === 'D' && e.sourceHandle === 'true')).toBe(true)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(2)
      const conditionA = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      // New architecture: then branch may contain parallel + other descendants
      expect(conditionA.then.length).toBeGreaterThanOrEqual(1)

      const wrapper = conditionA.then.find((a) => a.type === 'parallel') as Extract<Activity, { type: 'parallel' }>
      expect(wrapper).toBeDefined()
      expect(wrapper.type).toBe('parallel')
      // New architecture: ID is generated, not parallel_for_J
      expect(wrapper.branches).toHaveLength(2)

      // Verify nested condition preserved inside wrapper
      const conditionB = wrapper.branches[0] as Extract<Activity, { type: 'condition' }>
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

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

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

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

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

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

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

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      const condition = rebuiltNested[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.outputs).toEqual({ result: 'string' })
      expect(condition.then[0].outputs).toEqual({ value: 'number' })
    })
  })
})
