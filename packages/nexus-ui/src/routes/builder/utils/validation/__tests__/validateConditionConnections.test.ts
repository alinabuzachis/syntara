import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { EdgeConnection } from '../../workflowTransform'
import { validateConditionConnections } from '../rules/validateConditionConnections'

describe('validateConditionConnections', () => {
  it('returns no errors for condition with both branches connected', () => {
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
    ]

    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C1-T2', source: 'C1', target: 'T2', sourceHandle: 'false', targetHandle: 'target' },
    ]

    const result = validateConditionConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('detects missing Then branch connection', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'false', targetHandle: 'target' },
      // Missing 'true' (then) branch
    ]

    const result = validateConditionConnections(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      severity: 'error',
      rule: 'condition-connections',
      nodeId: 'C1',
      message: expect.stringContaining('Then') as unknown as string,
    })
  })

  it('allows missing Else branch connection (else is optional)', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      // Missing 'false' (else) branch - this is now allowed
    ]

    const result = validateConditionConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('detects missing Then branch (only Then is required)', () => {
    const activities: Activity[] = [
      { type: 'condition', id: 'C1', name: 'Condition 1', condition: 'x > 10', then: [], else: [] },
    ]

    const edges: EdgeConnection[] = []

    const result = validateConditionConnections(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      severity: 'error',
      rule: 'condition-connections',
      nodeId: 'C1',
      message: expect.stringContaining('Then') as unknown as string,
    })
  })

  it('handles multiple condition nodes', () => {
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
      {
        type: 'task',
        id: 'T3',
        name: 'Task 3',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const edges: EdgeConnection[] = [
      // C1: both branches connected
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C1-T2', source: 'C1', target: 'T2', sourceHandle: 'false', targetHandle: 'target' },
      // C2: only then branch connected (valid since else is optional)
      { id: 'C2-T3', source: 'C2', target: 'T3', sourceHandle: 'true', targetHandle: 'target' },
    ]

    const result = validateConditionConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('ignores non-condition nodes', () => {
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
    ]

    const edges: EdgeConnection[] = [
      { id: 'T1-T2', source: 'T1', target: 'T2', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateConditionConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('handles empty workflow', () => {
    const result = validateConditionConnections([], [])
    expect(result).toEqual([])
  })
})
