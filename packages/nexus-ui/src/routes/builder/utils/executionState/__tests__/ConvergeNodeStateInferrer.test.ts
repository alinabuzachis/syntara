import type { Activity, ActivityState } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { EdgeConnection } from '../../../types/edge'
import { ConvergeNodeStateInferrer } from '../nodeStateInference'

describe('ConvergeNodeStateInferrer', () => {
  const inferrer = new ConvergeNodeStateInferrer()

  it('infers running when at least one incoming node completed but not all', () => {
    const activity: Activity = {
      id: 'converge-1',
      name: 'Converge',
      type: 'converge',
      converge: { branches: ['task-a', 'task-b'], strategy: 'all' },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'task-a', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '2', source: 'task-b', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '3', source: 'converge-1', target: 'task-after', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-a', { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' }],
      ['task-b', { status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
      ['task-after', { status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('running')
  })

  it('infers completed when all incoming nodes completed', () => {
    const activity: Activity = {
      id: 'converge-1',
      name: 'Converge',
      type: 'converge',
      converge: { branches: ['task-a', 'task-b'], strategy: 'all' },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'task-a', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '2', source: 'task-b', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '3', source: 'converge-1', target: 'task-after', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-a', { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' }],
      ['task-b', { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' }],
      ['task-after', { status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('completed')
  })

  it('infers completed when outgoing node has started even if incoming incomplete', () => {
    const activity: Activity = {
      id: 'converge-1',
      name: 'Converge',
      type: 'converge',
      converge: { branches: ['task-a', 'task-b'], strategy: 'all' },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'task-a', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '2', source: 'task-b', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '3', source: 'converge-1', target: 'task-after', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-a', { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' }],
      ['task-b', { status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
      ['task-after', { status: 'running', startedAt: '2024-01-01T00:02:00Z', completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('completed')
  })

  it('returns null when no incoming nodes have started', () => {
    const activity: Activity = {
      id: 'converge-1',
      name: 'Converge',
      type: 'converge',
      converge: { branches: ['task-a', 'task-b'], strategy: 'all' },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'task-a', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '2', source: 'task-b', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '3', source: 'converge-1', target: 'task-after', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-a', { status: 'pending', startedAt: null, completedAt: null }],
      ['task-b', { status: 'pending', startedAt: null, completedAt: null }],
      ['task-after', { status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result).toBeNull()
  })

  it('treats failed nodes as completed for convergence', () => {
    const activity: Activity = {
      id: 'converge-1',
      name: 'Converge',
      type: 'converge',
      converge: { branches: ['task-a', 'task-b'], strategy: 'all' },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'task-a', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '2', source: 'task-b', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-a', { status: 'failed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' }],
      ['task-b', { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('completed')
  })

  it('handles converge with no outgoing edge', () => {
    const activity: Activity = {
      id: 'converge-1',
      name: 'Converge',
      type: 'converge',
      converge: { branches: ['task-a', 'task-b'], strategy: 'all' },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'task-a', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '2', source: 'task-b', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-a', { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' }],
      ['task-b', { status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('running')
  })

  it('handles mix of completed and failed incoming nodes', () => {
    const activity: Activity = {
      id: 'converge-1',
      name: 'Converge',
      type: 'converge',
      converge: { branches: ['task-a', 'task-b', 'task-c'], strategy: 'all' },
    }
    const edges: EdgeConnection[] = [
      { id: '1', source: 'task-a', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '2', source: 'task-b', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      { id: '3', source: 'task-c', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const activityStates = new Map<string, ActivityState>([
      ['task-a', { status: 'completed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' }],
      ['task-b', { status: 'failed', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:01:00Z' }],
      ['task-c', { status: 'pending', startedAt: null, completedAt: null }],
    ])

    const result = inferrer.inferState(activity, edges, activityStates)

    expect(result?.status).toBe('running') // Two done but one still pending
  })
})
