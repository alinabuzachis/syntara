import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { ActivityState } from '../../../../automations/execution/types'
import type { EdgeConnection } from '../../../types/edge'
import { ConditionalNodeStateInferrer } from '../nodeStateInference'

describe('ConditionalNodeStateInferrer', () => {
  const inferrer = new ConditionalNodeStateInferrer()

  it('infers completed when true branch target has started', () => {
    const activity: Activity = {
      id: 'cond-1',
      name: 'Conditional',
      type: 'condition',
      condition: 'x > 5',
      then: [],
      else: [],
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'cond-1', target: 'task-true', sourceHandle: 'true', targetHandle: 'target' },
      { id: '2', source: 'cond-1', target: 'task-false', sourceHandle: 'false', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      [
        'task-true',
        { activityId: 'task-true', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null },
      ],
      ['task-false', { activityId: 'task-false', status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('completed')
  })

  it('infers completed when false branch target has started', () => {
    const activity: Activity = {
      id: 'cond-1',
      name: 'Conditional',
      type: 'condition',
      condition: 'x > 5',
      then: [],
      else: [],
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'cond-1', target: 'task-true', sourceHandle: 'true', targetHandle: 'target' },
      { id: '2', source: 'cond-1', target: 'task-false', sourceHandle: 'false', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-true', { activityId: 'task-true', status: 'pending', startedAt: null, completedAt: null }],
      [
        'task-false',
        {
          activityId: 'task-false',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
        },
      ],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('completed')
  })

  it('returns null when no branch targets have started', () => {
    const activity: Activity = {
      id: 'cond-1',
      name: 'Conditional',
      type: 'condition',
      condition: 'x > 5',
      then: [],
      else: [],
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'cond-1', target: 'task-true', sourceHandle: 'true', targetHandle: 'target' },
      { id: '2', source: 'cond-1', target: 'task-false', sourceHandle: 'false', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-true', { activityId: 'task-true', status: 'pending', startedAt: null, completedAt: null }],
      ['task-false', { activityId: 'task-false', status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result).toBeNull()
  })

  it('works with approval nodes (approved handle)', () => {
    const activity: Activity = {
      id: 'approval-1',
      name: 'Approval',
      type: 'approval',
      onApproved: [],
      onRejected: [],
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'approval-1', target: 'task-approved', sourceHandle: 'approved', targetHandle: 'target' },
      { id: '2', source: 'approval-1', target: 'task-rejected', sourceHandle: 'rejected', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      [
        'task-approved',
        {
          activityId: 'task-approved',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
        },
      ],
      ['task-rejected', { activityId: 'task-rejected', status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('completed')
  })

  it('works with approval nodes (rejected handle)', () => {
    const activity: Activity = {
      id: 'approval-1',
      name: 'Approval',
      type: 'approval',
      onApproved: [],
      onRejected: [],
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'approval-1', target: 'task-approved', sourceHandle: 'approved', targetHandle: 'target' },
      { id: '2', source: 'approval-1', target: 'task-rejected', sourceHandle: 'rejected', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-approved', { activityId: 'task-approved', status: 'pending', startedAt: null, completedAt: null }],
      [
        'task-rejected',
        { activityId: 'task-rejected', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null },
      ],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('completed')
  })

  it('ignores non-branch edges', () => {
    const activity: Activity = {
      id: 'cond-1',
      name: 'Conditional',
      type: 'condition',
      condition: 'x > 5',
      then: [],
      else: [],
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'cond-1', target: 'task-true', sourceHandle: 'true', targetHandle: 'target' },
      { id: '2', source: 'cond-1', target: 'task-false', sourceHandle: 'false', targetHandle: 'target' },
      { id: '3', source: 'task-other', target: 'cond-1', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-true', { activityId: 'task-true', status: 'pending', startedAt: null, completedAt: null }],
      ['task-false', { activityId: 'task-false', status: 'pending', startedAt: null, completedAt: null }],
      [
        'task-other',
        {
          activityId: 'task-other',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
        },
      ],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    // Should be null because branch targets haven't started (ignores task-other)
    expect(result).toBeNull()
  })

  it('handles conditional with multiple targets per branch', () => {
    const activity: Activity = {
      id: 'cond-1',
      name: 'Conditional',
      type: 'condition',
      condition: 'x > 5',
      then: [],
      else: [],
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'cond-1', target: 'task-a', sourceHandle: 'true', targetHandle: 'target' },
      { id: '2', source: 'cond-1', target: 'task-b', sourceHandle: 'true', targetHandle: 'target' },
      { id: '3', source: 'cond-1', target: 'task-c', sourceHandle: 'false', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-a', { activityId: 'task-a', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
      ['task-b', { activityId: 'task-b', status: 'pending', startedAt: null, completedAt: null }],
      ['task-c', { activityId: 'task-c', status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    // Should be completed because at least one branch target started
    expect(result?.status).toBe('completed')
  })
})
