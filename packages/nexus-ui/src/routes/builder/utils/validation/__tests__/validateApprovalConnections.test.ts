import { EdgeHandleEnum, type Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { makeCondition } from '../../../../../test/test-helpers'
import type { EdgeConnection } from '../../workflowTransform'
import { validateApprovalConnections } from '../rules/validateApprovalConnections'

describe('validateApprovalConnections', () => {
  it('returns no errors when approval node has approved branch connected', () => {
    const activities: Activity[] = [
      {
        type: 'approval',
        id: 'approval-1',
        name: 'Approval Task',
        approval: { approvers: ['user1'], prompt: 'Approve?', timeout: 3600, onTimeout: 'fail' },
      },
      {
        type: 'task',
        id: 'task-1',
        name: 'Next Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
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
      {
        type: 'approval',
        id: 'approval-1',
        name: 'Approval Task',
        approval: { approvers: ['user1'], prompt: 'Approve?', timeout: 3600, onTimeout: 'fail' },
      },
      {
        type: 'task',
        id: 'task-approved',
        name: 'Approved Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'task-rejected',
        name: 'Rejected Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
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
      {
        type: 'approval',
        id: 'approval-1',
        name: 'Approval Task',
        approval: { approvers: ['user1'], prompt: 'Approve?', timeout: 3600, onTimeout: 'fail' },
      },
      {
        type: 'task',
        id: 'task-rejected',
        name: 'Rejected Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = [
      // Only rejected branch connected, missing approved branch
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
      message: expect.stringContaining('Approved'),
    })
  })

  it('detects missing approved branch when no edges exist', () => {
    const activities: Activity[] = [
      {
        type: 'approval',
        id: 'approval-1',
        name: 'Approval Task',
        approval: { approvers: ['user1'], prompt: 'Approve?', timeout: 3600, onTimeout: 'fail' },
      },
    ]
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
      {
        type: 'task',
        id: 'approval-1',
        name: 'First Approval',
        task: { executor: 'script', config: { language: 'python', code: '' } },
        requiresApproval: true,
        approval: { approvers: ['user1'], prompt: 'Approve?' },
      },
      {
        type: 'approval',
        id: 'approval-2',
        name: 'Second Approval',
        approval: { approvers: ['user2'], prompt: 'Approve?', timeout: 3600, onTimeout: 'fail' },
      },
      {
        type: 'task',
        id: 'task-1',
        name: 'Next Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = [
      // First approval has approved branch connected
      {
        id: 'approval-1-task-1',
        source: 'approval-1',
        target: 'task-1',
        sourceHandle: EdgeHandleEnum.APPROVED,
        targetHandle: 'target',
      },
      // Second approval is missing approved branch
    ]

    const result = validateApprovalConnections(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('approval-2')
  })

  it('ignores non-approval task nodes', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'task-1',
        name: 'Regular Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
        // No requiresApproval or approval fields
      },
    ]
    const edges: EdgeConnection[] = []

    const result = validateApprovalConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('ignores task nodes with requiresApproval but no approval config', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'task-1',
        name: 'Incomplete Approval Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
        requiresApproval: true,
        // Missing approval config
      },
    ]
    const edges: EdgeConnection[] = []

    const result = validateApprovalConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('ignores non-task activity types', () => {
    const activities = [
      makeCondition({ id: 'C1', name: 'Condition' }),
      {
        type: 'trigger',
        id: 'trigger-1',
        name: 'Start',
        trigger: { executor: 'manual', config: {} },
      },
    ] as unknown as Activity[]
    const edges: EdgeConnection[] = []

    const result = validateApprovalConnections(activities, edges)
    expect(result).toEqual([])
  })

  it('handles empty workflow', () => {
    const result = validateApprovalConnections([], [])
    expect(result).toEqual([])
  })

  it('includes suggestion in error message', () => {
    const activities: Activity[] = [
      {
        type: 'approval',
        id: 'approval-1',
        name: 'Approval Task',
        approval: { approvers: ['user1'], prompt: 'Approve?', timeout: 3600, onTimeout: 'fail' },
      },
    ]
    const edges: EdgeConnection[] = []

    const result = validateApprovalConnections(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0].suggestion).toBeDefined()
    expect(result[0].suggestion).toContain('Approved')
  })
})
