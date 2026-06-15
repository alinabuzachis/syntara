import { EdgeHandleEnum, type Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { EdgeConnection } from '../../../types/edge'
import { validateApprovalConnections } from '../rules/validateApprovalConnections'

describe('validateApprovalConnections', () => {
  it('returns no errors when approval node has approved branch connected', () => {
    const activities: Activity[] = [
      { type: 'approval', id: 'approval-1', name: 'Approval Task', parameters: {} },
      { type: 'script', id: 'task-1', name: 'Next Task', parameters: { language: 'python', code: '' } },
    ]
    const edges: EdgeConnection[] = [
      {
        id: 'approval-1-task-1',
        source: 'approval-1',
        target: 'task-1',
        sourceHandle: EdgeHandleEnum.APPROVED,
        targetHandle: 'target',
      },
    ]

    const result = validateApprovalConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('returns no errors when approval node has both branches connected', () => {
    const activities: Activity[] = [
      { type: 'approval', id: 'approval-1', name: 'Approval Task', parameters: {} },
      { type: 'script', id: 'task-approved', name: 'Approved Task', parameters: { language: 'python', code: '' } },
      { type: 'script', id: 'task-rejected', name: 'Rejected Task', parameters: { language: 'python', code: '' } },
    ]
    const edges: EdgeConnection[] = [
      {
        id: 'approval-1-task-approved',
        source: 'approval-1',
        target: 'task-approved',
        sourceHandle: EdgeHandleEnum.APPROVED,
        targetHandle: 'target',
      },
      {
        id: 'approval-1-task-rejected',
        source: 'approval-1',
        target: 'task-rejected',
        sourceHandle: EdgeHandleEnum.REJECTED,
        targetHandle: 'target',
      },
    ]

    const result = validateApprovalConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('detects missing approved branch connection', () => {
    const activities: Activity[] = [
      { type: 'approval', id: 'approval-1', name: 'Approval Task', parameters: {} },
      { type: 'script', id: 'task-rejected', name: 'Rejected Task', parameters: { language: 'python', code: '' } },
    ]
    const edges: EdgeConnection[] = [
      {
        id: 'approval-1-task-rejected',
        source: 'approval-1',
        target: 'task-rejected',
        sourceHandle: EdgeHandleEnum.REJECTED,
        targetHandle: 'target',
      },
    ]

    const result = validateApprovalConnections(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      severity: 'error',
      rule: 'approval-connections',
      nodeId: 'approval-1',
      message: expect.stringContaining('Approved') as unknown as string,
    })
  })

  it('detects missing approved branch when no edges exist', () => {
    const activities: Activity[] = [{ type: 'approval', id: 'approval-1', name: 'Approval Task', parameters: {} }]
    const edges: EdgeConnection[] = []

    const result = validateApprovalConnections(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      severity: 'error',
      rule: 'approval-connections',
      nodeId: 'approval-1',
    })
  })

  it('handles multiple approval nodes', () => {
    const activities: Activity[] = [
      { type: 'approval', id: 'approval-2', name: 'Second Approval', parameters: {} },
      { type: 'script', id: 'task-1', name: 'Next Task', parameters: { language: 'python', code: '' } },
    ]
    const edges: EdgeConnection[] = []

    const result = validateApprovalConnections(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('approval-2')
  })

  it('ignores non-approval activity types', () => {
    const activities: Activity[] = [
      { type: 'script', id: 'task-1', name: 'Regular Task', parameters: { language: 'python', code: '' } },
      { type: 'condition', id: 'C1', name: 'Condition', parameters: { condition: 'x > 10' } },
    ]
    const edges: EdgeConnection[] = []

    const result = validateApprovalConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('handles empty workflow', () => {
    const result = validateApprovalConnections([], [])
    expect(result).toEqual([])
  })

  it('includes suggestion in error message', () => {
    const activities: Activity[] = [{ type: 'approval', id: 'approval-1', name: 'Approval Task', parameters: {} }]
    const edges: EdgeConnection[] = []

    const result = validateApprovalConnections(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0].suggestion).toBeDefined()
    expect(result[0].suggestion).toContain('Approved')
  })
})
