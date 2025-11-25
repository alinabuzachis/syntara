import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { generateEdgesFromStructure } from './generateEdgesFromStructure'

describe('generateEdgesFromStructure', () => {
  describe('Sequential edges', () => {
    it('generates sequential edges between top-level activities', () => {
      const activities: Activity[] = [
        {
          type: 'task',
          id: 'A',
          name: 'Task A',
          task: { executor: 'script', config: { language: 'python', code: 'print("A")' } },
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

      const edges = generateEdgesFromStructure(activities)

      expect(edges).toHaveLength(2)
      expect(edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
        sourceHandle: 'source',
      })
      expect(edges[1]).toMatchObject({
        source: 'B',
        target: 'C',
        sourceHandle: 'source',
      })
    })

    it('skips condition nodes as sources for sequential edges', () => {
      const activities: Activity[] = [
        {
          type: 'task',
          id: 'A',
          name: 'Task A',
          task: { executor: 'script', config: { language: 'python', code: 'print("A")' } },
        },
        {
          type: 'condition',
          id: 'B',
          name: 'Condition B',
          condition: 'input.value > 10',
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

      const edges = generateEdgesFromStructure(activities)

      // Should create edge from A to B (task to condition is valid)
      expect(edges.some((e) => e.source === 'A' && e.target === 'B')).toBe(true)
      // Should not create edge from B to C (condition nodes skip in sequential flow)
      expect(edges.some((e) => e.source === 'B' && e.target === 'C')).toBe(false)
    })
  })

  describe('Condition edges', () => {
    it('generates edges from condition to then branch', () => {
      const activities: Activity[] = [
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

      const edges = generateEdgesFromStructure(activities)

      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
    })

    it('generates edges from condition to then and else branches', () => {
      const activities: Activity[] = [
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

      const edges = generateEdgesFromStructure(activities)

      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'A' && e.target === 'C' && e.sourceHandle === 'false')).toBe(true)
    })

    it('generates sequential edges within then branch', () => {
      const activities: Activity[] = [
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

      const edges = generateEdgesFromStructure(activities)

      expect(edges.some((e) => e.source === 'B' && e.target === 'C' && e.sourceHandle === 'source')).toBe(true)
    })

    it('generates edges to branches when then branch starts with parallel_for_* wrapper', () => {
      const activities: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [
            {
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
            },
          ],
          else: [],
        },
      ]

      const edges = generateEdgesFromStructure(activities)

      // Should create edges from condition to each branch, not to the wrapper
      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'A' && e.target === 'C' && e.sourceHandle === 'true')).toBe(true)
      // Should NOT create edge to the wrapper
      expect(edges.some((e) => e.source === 'A' && e.target === 'parallel_for_J')).toBe(false)
    })
  })

  describe('Parallel_for_* wrapper edges', () => {
    it('generates edges from branches to join node', () => {
      const activities: Activity[] = [
        {
          type: 'parallel',
          id: 'parallel_for_J',
          name: 'Parallel for J',
          branches: [
            {
              type: 'task',
              id: 'A',
              name: 'Task A',
              task: { executor: 'script', config: { language: 'python', code: 'print("A")' } },
            },
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
            },
          ],
        },
        {
          type: 'join',
          id: 'J',
          name: 'Join J',
          join: { strategy: 'all' },
        },
      ]

      const edges = generateEdgesFromStructure(activities)

      expect(edges.some((e) => e.source === 'A' && e.target === 'J')).toBe(true)
      expect(edges.some((e) => e.source === 'B' && e.target === 'J')).toBe(true)
    })

    it('skips parallel_for_* wrappers when previous activity connects', () => {
      const activities: Activity[] = [
        {
          type: 'task',
          id: 'T',
          name: 'Task T',
          task: { executor: 'script', config: { language: 'python', code: 'print("T")' } },
        },
        {
          type: 'parallel',
          id: 'parallel_for_J',
          name: 'Parallel for J',
          branches: [
            {
              type: 'task',
              id: 'A',
              name: 'Task A',
              task: { executor: 'script', config: { language: 'python', code: 'print("A")' } },
            },
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
            },
          ],
        },
      ]

      const edges = generateEdgesFromStructure(activities)

      // Previous activity should connect to each branch
      expect(edges.some((e) => e.source === 'T' && e.target === 'A')).toBe(true)
      expect(edges.some((e) => e.source === 'T' && e.target === 'B')).toBe(true)
      // Should NOT connect to the wrapper
      expect(edges.some((e) => e.source === 'T' && e.target === 'parallel_for_J')).toBe(false)
    })
  })

  describe('Nested conditions', () => {
    it('recursively generates edges for nested conditions', () => {
      const activities: Activity[] = [
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

      const edges = generateEdgesFromStructure(activities)

      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'B' && e.target === 'C' && e.sourceHandle === 'true')).toBe(true)
    })
  })

  describe('Complex scenarios', () => {
    it('handles condition with parallel_for_* wrapper containing nested condition', () => {
      const activities: Activity[] = [
        {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.a > 10',
          then: [
            {
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
            },
          ],
          else: [],
        },
        {
          type: 'join',
          id: 'J',
          name: 'Join J',
          join: { strategy: 'all' },
        },
      ]

      const edges = generateEdgesFromStructure(activities)

      // Condition A connects to branches (B and C)
      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'true')).toBe(true)
      expect(edges.some((e) => e.source === 'A' && e.target === 'C' && e.sourceHandle === 'true')).toBe(true)

      // Nested condition B connects to D
      expect(edges.some((e) => e.source === 'B' && e.target === 'D' && e.sourceHandle === 'true')).toBe(true)

      // Only branches at the parallel wrapper level connect to join
      // D is nested inside B's then branch, so B connects to J, not D
      expect(edges.some((e) => e.source === 'B' && e.target === 'J')).toBe(true)
      expect(edges.some((e) => e.source === 'C' && e.target === 'J')).toBe(true)
    })
  })
})
