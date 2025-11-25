import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { flattenConditionStructure } from './flattenConditionStructure'

describe('flattenConditionStructure', () => {
  it('flattens condition with then branch', () => {
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

    const result = flattenConditionStructure(activities)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('A')
    expect(result[0].type).toBe('condition')
    const condition = result[0] as Extract<Activity, { type: 'condition' }>
    expect(condition.then).toEqual([])
    expect(result[1].id).toBe('B')
  })

  it('flattens condition with then and else branches', () => {
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

    const result = flattenConditionStructure(activities)

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('A')
    const condition = result[0] as Extract<Activity, { type: 'condition' }>
    expect(condition.then).toEqual([])
    expect(condition.else).toEqual([])
    expect(result[1].id).toBe('B')
    expect(result[2].id).toBe('C')
  })

  it('recursively flattens nested conditions', () => {
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

    const result = flattenConditionStructure(activities)

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('A')
    expect(result[1].id).toBe('B')
    expect(result[2].id).toBe('C')

    // All conditions should have empty branches
    const conditionA = result[0] as Extract<Activity, { type: 'condition' }>
    expect(conditionA.then).toEqual([])
    const conditionB = result[1] as Extract<Activity, { type: 'condition' }>
    expect(conditionB.then).toEqual([])
  })

  it('preserves parallel_for_* wrappers', () => {
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
      {
        type: 'join',
        id: 'J',
        name: 'Join J',
        join: { strategy: 'all' },
      },
    ]

    const result = flattenConditionStructure(activities)

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('A')
    expect(result[1].id).toBe('parallel_for_J')
    expect(result[2].id).toBe('J')

    // Parallel wrapper should preserve its branches
    const wrapper = result[1] as Extract<Activity, { type: 'parallel' }>
    expect(wrapper.branches).toHaveLength(2)
    expect(wrapper.branches![0].id).toBe('B')
    expect(wrapper.branches![1].id).toBe('C')
  })

  it('handles multiple top-level activities', () => {
    const activities: Activity[] = [
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
      {
        type: 'task',
        id: 'T2',
        name: 'Task 2',
        task: { executor: 'script', config: { language: 'python', code: 'print("2")' } },
      },
    ]

    const result = flattenConditionStructure(activities)

    expect(result).toHaveLength(4)
    expect(result[0].id).toBe('T1')
    expect(result[1].id).toBe('A')
    expect(result[2].id).toBe('B')
    expect(result[3].id).toBe('T2')
  })
})
