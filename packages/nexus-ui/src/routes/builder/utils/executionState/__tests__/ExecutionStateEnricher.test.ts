import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { ActivityState } from '../../../../automations/execution/types'
import type { EdgeConnection } from '../../../types/edge'
import { ExecutionStateEnricher } from '../ExecutionStateEnricher'

describe('ExecutionStateEnricher', () => {
  const enricher = new ExecutionStateEnricher()

  describe('enrichActivity', () => {
    it('returns activity as-is when not in execution view', () => {
      const activity: Activity = {
        id: 'task-1',
        name: 'Task 1',
        type: 'script',
        config: { language: 'python', code: '' },
      }
      const edges: EdgeConnection[] = []
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.enrichActivity(activity, null, activityStates, edges)

      expect(result).toEqual(activity)
      expect(result.__executionState).toBeUndefined()
    })

    it('adds execution badge flag to metadata', () => {
      const activity: Activity = {
        id: 'task-1',
        name: 'Task 1',
        type: 'script',
        config: { language: 'python', code: '' },
      }
      const edges: EdgeConnection[] = []
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      expect(
        ((result as Record<string, unknown>).metadata as Record<string, unknown> | undefined)?.__showExecutionBadge
      ).toBe(true)
    })

    it('preserves existing metadata when adding badge flag', () => {
      const activity = {
        id: 'task-1',
        name: 'Task 1',
        type: 'script',
        config: { language: 'python', code: '' },
        metadata: { customProp: 'value' },
      } as unknown as Activity
      const edges: EdgeConnection[] = []
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      expect(result.metadata).toEqual({
        customProp: 'value',
        __showExecutionBadge: true,
      })
    })

    it('adds backend state when available in activityStates', () => {
      const activity: Activity = {
        id: 'task-1',
        name: 'Task 1',
        type: 'script',
        config: { language: 'python', code: '' },
      }
      const edges: EdgeConnection[] = []
      const activityStates = new Map<string, ActivityState>([
        ['task-1', { activityId: 'task-1', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
      ])

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      expect(result.__executionState).toEqual({
        status: 'running',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: undefined,
        error_details: undefined,
      })
    })

    it('infers state for loop node when no backend state', () => {
      const activity: Activity = {
        id: 'loop-1',
        name: 'Loop',
        type: 'loop',
        config: { type: 'for_each', items: '[1,2,3]' },
      }
      const edges: EdgeConnection[] = [
        { id: '1', source: 'loop-1', target: 'task-body', sourceHandle: 'loop', targetHandle: 'target' },
        { id: '2', source: 'loop-1', target: 'task-after', sourceHandle: 'done', targetHandle: 'target' },
      ]
      const activityStates = new Map<string, ActivityState>([
        [
          'task-body',
          { activityId: 'task-body', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null },
        ],
      ])

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      expect(result.__executionState?.status).toBe('running')
    })

    it('infers state for converge node when no backend state', () => {
      const activity: Activity = {
        id: 'converge-1',
        name: 'Converge',
        type: 'converge',
        config: { strategy: 'all' },
      }
      const edges: EdgeConnection[] = [
        { id: '1', source: 'task-a', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
        { id: '2', source: 'task-b', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
      ]
      const activityStates = new Map<string, ActivityState>([
        [
          'task-a',
          {
            activityId: 'task-a',
            status: 'completed',
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:01:00Z',
          },
        ],
        ['task-b', { activityId: 'task-b', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
      ])

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      expect(result.__executionState?.status).toBe('running')
    })

    it('infers state for conditional node when no backend state', () => {
      const activity: Activity = {
        id: 'cond-1',
        name: 'Conditional',
        type: 'condition',
        config: { condition: 'x > 5' },
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
      ])

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      expect(result.__executionState?.status).toBe('completed')
    })

    it('marks node as skipped when on non-taken branch', () => {
      const activity: Activity = {
        id: 'task-false',
        name: 'Task False',
        type: 'script',
        config: { language: 'python', code: '' },
      }
      const edges: EdgeConnection[] = [
        { id: '1', source: 'cond-1', target: 'task-true', sourceHandle: 'true', targetHandle: 'target' },
        { id: '2', source: 'cond-1', target: 'task-false', sourceHandle: 'false', targetHandle: 'target' },
      ]
      const activityStates = new Map<string, ActivityState>([
        [
          'cond-1',
          {
            activityId: 'cond-1',
            status: 'completed',
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:01:00Z',
          },
        ],
        [
          'task-true',
          {
            activityId: 'task-true',
            status: 'completed',
            startedAt: '2024-01-01T00:01:00Z',
            completedAt: '2024-01-01T00:02:00Z',
          },
        ],
      ])

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      expect(result.__executionState?.status).toBe('skipped')
    })

    it('sets pending state for structural node with no inferred state', () => {
      const activity: Activity = {
        id: 'loop-1',
        name: 'Loop',
        type: 'loop',
        config: { type: 'for_each', items: '[1,2,3]' },
      }
      const edges: EdgeConnection[] = [
        { id: '1', source: 'loop-1', target: 'task-body', sourceHandle: 'loop', targetHandle: 'target' },
        { id: '2', source: 'loop-1', target: 'task-after', sourceHandle: 'done', targetHandle: 'target' },
      ]
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      expect(result.__executionState?.status).toBe('pending')
    })

    it('does not set pending state for regular task nodes', () => {
      const activity: Activity = {
        id: 'task-1',
        name: 'Task 1',
        type: 'script',
        config: { language: 'python', code: '' },
      }
      const edges: EdgeConnection[] = []
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      // Regular tasks without backend state shouldn't get a pending badge
      expect(result.__executionState).toBeUndefined()
    })

    it('works with approval nodes using conditional logic', () => {
      const activity: Activity = {
        id: 'approval-1',
        name: 'Approval',
        type: 'approval',
        config: {},
      }
      const edges: EdgeConnection[] = [
        { id: '1', source: 'approval-1', target: 'task-approved', sourceHandle: 'approved', targetHandle: 'target' },
        { id: '2', source: 'approval-1', target: 'task-rejected', sourceHandle: 'rejected', targetHandle: 'target' },
      ]
      const activityStates = new Map<string, ActivityState>([
        [
          'task-approved',
          { activityId: 'task-approved', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null },
        ],
      ])

      const result = enricher.enrichActivity(activity, 'running', activityStates, edges)

      expect(result.__executionState?.status).toBe('completed')
    })
  })

  describe('determineEdgeStatus', () => {
    it('returns pending when source is running (not terminal)', () => {
      const edge = { source: 'task-1', target: 'task-2' }
      const activityStates = new Map<string, ActivityState>([
        ['task-1', { activityId: 'task-1', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
      ])

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('pending')
    })

    it('returns passed when source has completed', () => {
      const edge = { source: 'task-1', target: 'task-2' }
      const activityStates = new Map<string, ActivityState>([
        [
          'task-1',
          {
            activityId: 'task-1',
            status: 'completed',
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:01:00Z',
          },
        ],
      ])

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('passed')
    })

    it('returns pending when source has not started', () => {
      const edge = { source: 'task-1', target: 'task-2' }
      const activityStates = new Map<string, ActivityState>([
        ['task-1', { activityId: 'task-1', status: 'pending', startedAt: null, completedAt: null }],
      ])

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('pending')
    })

    it('returns pending when source has no state', () => {
      const edge = { source: 'task-1', target: 'task-2' }
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('pending')
    })

    it('returns passed for branching edge when target has started', () => {
      const edge = { source: 'cond-1', target: 'task-true', sourceHandle: 'true' }
      const activityStates = new Map<string, ActivityState>([
        [
          'cond-1',
          {
            activityId: 'cond-1',
            status: 'completed',
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:01:00Z',
          },
        ],
        [
          'task-true',
          { activityId: 'task-true', status: 'running', startedAt: '2024-01-01T00:01:00Z', completedAt: null },
        ],
      ])

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('passed')
    })

    it('returns pending for branching edge when target has not started', () => {
      const edge = { source: 'cond-1', target: 'task-true', sourceHandle: 'true' }
      const activityStates = new Map<string, ActivityState>([
        [
          'cond-1',
          {
            activityId: 'cond-1',
            status: 'completed',
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:01:00Z',
          },
        ],
        ['task-true', { activityId: 'task-true', status: 'pending', startedAt: null, completedAt: null }],
      ])

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('pending')
    })

    it('returns passed for trigger edges when target has started', () => {
      const edge = { source: 'trigger-0', target: 'task-1', sourceHandle: null }
      const activityStates = new Map<string, ActivityState>([
        ['task-1', { activityId: 'task-1', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
      ])

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('passed')
    })

    it('returns pending for trigger edges when target is pending', () => {
      const edge = { source: 'trigger-0', target: 'task-1', sourceHandle: null }
      const activityStates = new Map<string, ActivityState>([
        ['task-1', { activityId: 'task-1', status: 'pending', startedAt: null, completedAt: null }],
      ])

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('pending')
    })

    it('returns pending for trigger edges when target has no state', () => {
      const edge = { source: 'trigger-0', target: 'task-1', sourceHandle: null }
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('pending')
    })

    it('returns passed for converge outgoing edge when target has started', () => {
      const edge = { source: 'converge-1', target: 'task-after', sourceHandle: null }
      const activityStates = new Map<string, ActivityState>([
        [
          'task-after',
          { activityId: 'task-after', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null },
        ],
      ])

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('passed')
    })

    it('returns pending for converge outgoing edge when target is pending', () => {
      const edge = { source: 'converge-1', target: 'task-after', sourceHandle: null }
      const activityStates = new Map<string, ActivityState>([
        ['task-after', { activityId: 'task-after', status: 'pending', startedAt: null, completedAt: null }],
      ])

      const result = enricher.determineEdgeStatus(edge, activityStates)

      expect(result).toBe('pending')
    })
  })

  describe('enrichTriggerNode', () => {
    it('returns trigger data as-is when not in execution view', () => {
      const triggerData = { name: 'Manual trigger', details: 'Manual', triggerType: 'manual' }
      const edges: EdgeConnection[] = []
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.enrichTriggerNode('trigger-0', triggerData, null, edges, activityStates)

      expect(result).toEqual(triggerData)
      expect(result.__executionState).toBeUndefined()
    })

    it('marks trigger as completed when any connected node has started', () => {
      const triggerData = { name: 'Manual trigger', details: 'Manual', triggerType: 'manual' }
      const edges: EdgeConnection[] = [
        { id: '1', source: 'trigger-0', target: 'task-1', sourceHandle: 'source', targetHandle: 'target' },
        { id: '2', source: 'trigger-0', target: 'task-2', sourceHandle: 'source', targetHandle: 'target' },
      ]
      const activityStates = new Map<string, ActivityState>([
        ['task-1', { activityId: 'task-1', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
        ['task-2', { activityId: 'task-2', status: 'pending', startedAt: null, completedAt: null }],
      ])

      const result = enricher.enrichTriggerNode('trigger-0', triggerData, 'running', edges, activityStates)

      expect(result.__executionState?.status).toBe('completed')
      expect(
        ((result as Record<string, unknown>).metadata as Record<string, unknown> | undefined)?.__showExecutionBadge
      ).toBe(true)
    })

    it('marks trigger as pending when all connected nodes are pending', () => {
      const triggerData = { name: 'Manual trigger', details: 'Manual', triggerType: 'manual' }
      const edges: EdgeConnection[] = [
        { id: '1', source: 'trigger-0', target: 'task-1', sourceHandle: 'source', targetHandle: 'target' },
        { id: '2', source: 'trigger-0', target: 'task-2', sourceHandle: 'source', targetHandle: 'target' },
      ]
      const activityStates = new Map<string, ActivityState>([
        ['task-1', { activityId: 'task-1', status: 'pending', startedAt: null, completedAt: null }],
        ['task-2', { activityId: 'task-2', status: 'pending', startedAt: null, completedAt: null }],
      ])

      const result = enricher.enrichTriggerNode('trigger-0', triggerData, 'running', edges, activityStates)

      expect(result.__executionState?.status).toBe('pending')
      expect(
        ((result as Record<string, unknown>).metadata as Record<string, unknown> | undefined)?.__showExecutionBadge
      ).toBe(true)
    })

    it('marks trigger as pending when no connected nodes have state', () => {
      const triggerData = { name: 'Manual trigger', details: 'Manual', triggerType: 'manual' }
      const edges: EdgeConnection[] = [
        { id: '1', source: 'trigger-0', target: 'task-1', sourceHandle: 'source', targetHandle: 'target' },
      ]
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.enrichTriggerNode('trigger-0', triggerData, 'running', edges, activityStates)

      expect(result.__executionState?.status).toBe('pending')
      expect(
        ((result as Record<string, unknown>).metadata as Record<string, unknown> | undefined)?.__showExecutionBadge
      ).toBe(true)
    })

    it('marks trigger as pending when trigger has no outgoing edges', () => {
      const triggerData = { name: 'Manual trigger', details: 'Manual', triggerType: 'manual' }
      const edges: EdgeConnection[] = []
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.enrichTriggerNode('trigger-0', triggerData, 'running', edges, activityStates)

      expect(result.__executionState?.status).toBe('pending')
      expect(
        ((result as Record<string, unknown>).metadata as Record<string, unknown> | undefined)?.__showExecutionBadge
      ).toBe(true)
    })

    it('preserves existing metadata when adding execution badge', () => {
      const triggerData = {
        name: 'Manual trigger',
        details: 'Manual',
        triggerType: 'manual',
        metadata: { customProp: 'value' },
      }
      const edges: EdgeConnection[] = []
      const activityStates = new Map<string, ActivityState>()

      const result = enricher.enrichTriggerNode('trigger-0', triggerData, 'running', edges, activityStates)

      expect(result.metadata).toEqual({
        customProp: 'value',
        __showExecutionBadge: true,
      })
    })
  })
})
