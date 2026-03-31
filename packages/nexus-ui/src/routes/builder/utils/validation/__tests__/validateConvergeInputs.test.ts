import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { EdgeConnection } from '../../workflowTransform'
import { validateConvergeInputs } from '../rules/validateConvergeInputs'

describe('validateConvergeInputs', () => {
  it('returns no errors for valid converge with inputs from different conditions', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      { type: 'condition', id: 'C2', name: 'Condition 2', condition: 'y < 5', then: [], else: [] },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T2',
        name: 'Task 2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J1', name: 'Join 1', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C2-T2', source: 'C2', target: 'T2', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'T1-J1', source: 'T1', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'T2-J1', source: 'T2', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toEqual([])
  })

  it('detects converge receiving inputs from both branches of same condition', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T2',
        name: 'Task 2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J1', name: 'Join 1', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      // Both then and else from C1 go to same converge
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C1-T2', source: 'C1', target: 'T2', sourceHandle: 'false', targetHandle: 'target' },
      { id: 'T1-J1', source: 'T1', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'T2-J1', source: 'T2', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      severity: 'error',
      rule: 'converge-inputs',
      nodeIds: expect.arrayContaining(['J1', 'C1']) as unknown as string[],
    })
    expect(result[0].message).toContain('both')
    expect(result[0].message).toContain('Then')
    expect(result[0].message).toContain('Else')
  })

  it('handles converge with direct connections from condition (no intermediate tasks)', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      { type: 'converge', id: 'J1', name: 'Join 1', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'C1-J1-then', source: 'C1', target: 'J1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C1-J1-else', source: 'C1', target: 'J1', sourceHandle: 'false', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      severity: 'error',
      rule: 'converge-inputs',
    })
  })

  it('handles multi-level paths (condition → task → task → converge)', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T2',
        name: 'Task 2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T3',
        name: 'Task 3',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T4',
        name: 'Task 4',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J1', name: 'Join 1', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      // Then path: C1 → T1 → T2 → J1
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'T1-T2', source: 'T1', target: 'T2', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'T2-J1', source: 'T2', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
      // Else path: C1 → T3 → T4 → J1
      { id: 'C1-T3', source: 'C1', target: 'T3', sourceHandle: 'false', targetHandle: 'target' },
      { id: 'T3-T4', source: 'T3', target: 'T4', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'T4-J1', source: 'T4', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      severity: 'error',
      nodeIds: expect.arrayContaining(['J1', 'C1']) as unknown as string[],
    })
  })

  it('allows converge with only one branch from a condition', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T2',
        name: 'Task 2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T3',
        name: 'Task 3',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J1', name: 'Join 1', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      // Then path goes to converge
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'T1-J1', source: 'T1', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
      // Else path goes somewhere else
      { id: 'C1-T2', source: 'C1', target: 'T2', sourceHandle: 'false', targetHandle: 'target' },
      { id: 'T2-T3', source: 'T2', target: 'T3', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toEqual([])
  })

  it('handles multiple converge nodes', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T2',
        name: 'Task 2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T3',
        name: 'Task 3',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T4',
        name: 'Task 4',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J1', name: 'Join 1', converge: { strategy: 'all', branches: [] } },
      { type: 'converge', id: 'J2', name: 'Join 2', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      // J1: invalid (both branches from C1)
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C1-T2', source: 'C1', target: 'T2', sourceHandle: 'false', targetHandle: 'target' },
      { id: 'T1-J1', source: 'T1', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'T2-J1', source: 'T2', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
      // J2: valid (unrelated tasks)
      { id: 'T3-J2', source: 'T3', target: 'J2', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'T4-J2', source: 'T4', target: 'J2', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0].nodeIds).toContain('J1')
  })

  it('handles empty workflow', () => {
    const result = validateConvergeInputs([], [])
    expect(result).toEqual([])
  })

  it('handles cycles in graph without infinite loop', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T2',
        name: 'Task 2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J1', name: 'Join 1', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'T1-T2', source: 'T1', target: 'T2', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'T2-T1', source: 'T2', target: 'T1', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'T2-J1', source: 'T2', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toEqual([])
  })

  it('ignores condition edges with non-true/false handles', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      { type: 'converge', id: 'J1', name: 'Join 1', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'C1-J1', source: 'C1', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toEqual([])
  })

  it('uses condition ID as name when name is missing', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', condition: 'x > 10', then: [], else: [] } as Activity,
      { type: 'converge', id: 'J1', converge: { strategy: 'all', branches: [] } } as Activity,
    ]

    const edges: EdgeConnection[] = [
      { id: 'C1-J1-then', source: 'C1', target: 'J1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C1-J1-else', source: 'C1', target: 'J1', sourceHandle: 'false', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0].message).toContain('C1')
  })

  it('ignores converge nodes with no condition ancestors', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T2',
        name: 'Task 2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J1', name: 'Join 1', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'T1-J1', source: 'T1', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'T2-J1', source: 'T2', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateConvergeInputs(activities, edges)
    expect(result).toEqual([])
  })
})
