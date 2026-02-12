import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { makeCondition } from '../../../../../test/test-helpers'
import type { EdgeConnection } from '../../workflowTransform'
import { validateBranchConnections } from '../rules/validateBranchConnections'

describe('validateBranchConnections', () => {
  const defaultConfig = {
    nodeFilter: (a: Activity) => a.type === 'condition',
    requiredHandle: 'true',
    nodeTypeName: 'Condition',
    branchName: 'Then',
    errorIdPrefix: 'condition-missing-then',
    ruleName: 'condition-connections',
  }

  it('returns no errors when required branch is connected', () => {
    const activities: Activity[] = [
      makeCondition({ id: 'C1', name: 'Condition 1' }),
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
    ]

    const result = validateBranchConnections(activities, edges, defaultConfig)
    expect(result).toEqual([])
  })

  it('detects missing required branch connection', () => {
    const activities: Activity[] = [
      makeCondition({ id: 'C1', name: 'Condition 1' }),
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = [
      // Only false branch connected, missing true (required) branch
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'false', targetHandle: 'target' },
    ]

    const result = validateBranchConnections(activities, edges, defaultConfig)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'condition-missing-then-C1',
      severity: 'error',
      rule: 'condition-connections',
      nodeId: 'C1',
    })
  })

  it('includes node name in error message', () => {
    const activities: Activity[] = [makeCondition({ id: 'C1', name: 'My Custom Condition' })]
    const edges: EdgeConnection[] = []

    const result = validateBranchConnections(activities, edges, defaultConfig)
    expect(result).toHaveLength(1)
    expect(result[0].message).toContain('My Custom Condition')
    expect(result[0].message).toContain('Then')
  })

  it('falls back to node id when name is not provided', () => {
    // biome-ignore lint/suspicious/noThenProperty: Activity schema uses `then` for condition branches
    const activities: Activity[] = [{ type: 'condition', id: 'C1', condition: 'x > 10', then: [], else: [] }]
    const edges: EdgeConnection[] = []

    const result = validateBranchConnections(activities, edges, defaultConfig)
    expect(result).toHaveLength(1)
    expect(result[0].message).toContain('C1')
  })

  it('includes suggestion in error', () => {
    const activities: Activity[] = [makeCondition({ id: 'C1', name: 'Condition 1' })]
    const edges: EdgeConnection[] = []

    const result = validateBranchConnections(activities, edges, defaultConfig)
    expect(result).toHaveLength(1)
    expect(result[0].suggestion).toBeDefined()
    expect(result[0].suggestion).toContain('Then')
    expect(result[0].suggestion).toContain('condition')
  })

  it('handles multiple nodes with missing connections', () => {
    const activities: Activity[] = [
      makeCondition({ id: 'C1', name: 'Condition 1' }),
      makeCondition({ id: 'C2', name: 'Condition 2', condition: 'y < 5' }),
    ]
    const edges: EdgeConnection[] = []

    const result = validateBranchConnections(activities, edges, defaultConfig)
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.nodeId)).toEqual(['C1', 'C2'])
  })

  it('only validates nodes matching the filter', () => {
    const activities = [
      makeCondition({ id: 'C1', name: 'Condition 1' }),
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'trigger',
        id: 'trigger-1',
        name: 'Start',
        trigger: { executor: 'manual', config: {} },
      },
    ] as unknown as Activity[]
    const edges: EdgeConnection[] = []

    const result = validateBranchConnections(activities, edges, defaultConfig)
    // Only the condition node should have an error
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('C1')
  })

  it('works with custom configuration', () => {
    const customConfig = {
      nodeFilter: (a: Activity) => a.type === 'task' && a.id.startsWith('approval-'),
      requiredHandle: 'approved',
      nodeTypeName: 'Approval',
      branchName: 'Approved',
      errorIdPrefix: 'approval-missing-approved',
      ruleName: 'approval-connections',
    }

    const activities: Activity[] = [
      {
        type: 'task',
        id: 'approval-1',
        name: 'Approval Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'regular-task',
        name: 'Regular Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = []

    const result = validateBranchConnections(activities, edges, customConfig)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'approval-missing-approved-approval-1',
      rule: 'approval-connections',
      nodeId: 'approval-1',
    })
    expect(result[0].message).toContain('Approved')
  })

  it('handles empty activities array', () => {
    const result = validateBranchConnections([], [], defaultConfig)
    expect(result).toEqual([])
  })

  it('handles empty edges array', () => {
    const activities: Activity[] = [makeCondition({ id: 'C1', name: 'Condition 1' })]

    const result = validateBranchConnections(activities, [], defaultConfig)
    expect(result).toHaveLength(1)
  })

  it('correctly identifies edges from the node', () => {
    const activities: Activity[] = [
      makeCondition({ id: 'C1', name: 'Condition 1' }),
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = [
      // Edge TO the condition, not FROM it
      { id: 'T1-C1', source: 'T1', target: 'C1', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateBranchConnections(activities, edges, defaultConfig)
    // Should still report missing branch since there's no outgoing edge with 'true' handle
    expect(result).toHaveLength(1)
  })
})
