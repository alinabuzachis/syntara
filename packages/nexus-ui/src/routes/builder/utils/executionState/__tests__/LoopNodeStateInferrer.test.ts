import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { ActivityState } from '../../../../automations/execution/types'
import type { EdgeConnection } from '../../../types/edge'
import { LoopNodeStateInferrer } from '../nodeStateInference'

describe('LoopNodeStateInferrer', () => {
  const inferrer = new LoopNodeStateInferrer()

  it('infers completed when done edge target has started', () => {
    const activity: Activity = {
      id: 'loop-1',
      name: 'Loop',
      type: 'loop',
      loop: { type: 'forEach', items: '[1,2,3]', do: [] },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop', targetHandle: 'target' },
      { id: '2', source: 'loop-1', target: 'task-after-loop', sourceHandle: 'done', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      [
        'task-loop-body',
        {
          activityId: 'task-loop-body',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
        },
      ],
      [
        'task-after-loop',
        { activityId: 'task-after-loop', status: 'running', startedAt: '2024-01-01T00:02:00Z', completedAt: null },
      ],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('completed')
  })

  it('infers running when loop edge target has started but done edge target has not', () => {
    const activity: Activity = {
      id: 'loop-1',
      name: 'Loop',
      type: 'loop',
      loop: { type: 'forEach', items: '[1,2,3]', do: [] },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop', targetHandle: 'target' },
      { id: '2', source: 'loop-1', target: 'task-after-loop', sourceHandle: 'done', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      [
        'task-loop-body',
        { activityId: 'task-loop-body', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null },
      ],
      ['task-after-loop', { activityId: 'task-after-loop', status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('running')
  })

  it('returns null when neither edge target has started', () => {
    const activity: Activity = {
      id: 'loop-1',
      name: 'Loop',
      type: 'loop',
      loop: { type: 'forEach', items: '[1,2,3]', do: [] },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop', targetHandle: 'target' },
      { id: '2', source: 'loop-1', target: 'task-after-loop', sourceHandle: 'done', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-loop-body', { activityId: 'task-loop-body', status: 'pending', startedAt: null, completedAt: null }],
      ['task-after-loop', { activityId: 'task-after-loop', status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result).toBeNull()
  })

  it('returns null when no edges exist', () => {
    const activity: Activity = {
      id: 'loop-1',
      name: 'Loop',
      type: 'loop',
      loop: { type: 'forEach', items: '[1,2,3]', do: [] },
    }
    const edges: EdgeConnection[] = []
    const activityStates = new Map<string, ActivityState>()

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result).toBeNull()
  })

  it('handles missing activity states gracefully', () => {
    const activity: Activity = {
      id: 'loop-1',
      name: 'Loop',
      type: 'loop',
      loop: { type: 'forEach', items: '[1,2,3]', do: [] },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop', targetHandle: 'target' },
      { id: '2', source: 'loop-1', target: 'task-after-loop', sourceHandle: 'done', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>()

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result).toBeNull()
  })

  it('prioritizes done edge over loop edge when both targets started', () => {
    const activity: Activity = {
      id: 'loop-1',
      name: 'Loop',
      type: 'loop',
      loop: { type: 'forEach', items: '[1,2,3]', do: [] },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop', targetHandle: 'target' },
      { id: '2', source: 'loop-1', target: 'task-after-loop', sourceHandle: 'done', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      [
        'task-loop-body',
        {
          activityId: 'task-loop-body',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
        },
      ],
      [
        'task-after-loop',
        {
          activityId: 'task-after-loop',
          status: 'completed',
          startedAt: '2024-01-01T00:02:00Z',
          completedAt: '2024-01-01T00:03:00Z',
        },
      ],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    // Should return completed (done edge takes priority)
    expect(result?.status).toBe('completed')
  })
})
