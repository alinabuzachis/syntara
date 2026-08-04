import { describe, expect, it } from 'vitest'

import type { ActivityState } from '../../../../workflows/execution/types'
import type { EdgeConnection } from '../../../types/edge'
import { EdgeHelpers } from '../edgeHelpers'

describe('EdgeHelpers', () => {
  describe('findEdgesBySourceHandle', () => {
    it('returns edges matching source ID and handle', () => {
      const edges: EdgeConnection[] = [
        { id: '1', source: 'loop-1', target: 'task-1', sourceHandle: 'loop', targetHandle: 'target' },
        { id: '2', source: 'loop-1', target: 'task-2', sourceHandle: 'done', targetHandle: 'target' },
        { id: '3', source: 'task-3', target: 'task-4', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = EdgeHelpers.findEdgesBySourceHandle('loop-1', edges, 'loop')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('1')
      expect(result[0].target).toBe('task-1')
    })

    it('returns empty array when no edges match', () => {
      const edges: EdgeConnection[] = [
        { id: '1', source: 'task-1', target: 'task-2', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = EdgeHelpers.findEdgesBySourceHandle('loop-1', edges, 'loop')

      expect(result).toHaveLength(0)
    })

    it('returns multiple edges when multiple match', () => {
      const edges: EdgeConnection[] = [
        { id: '1', source: 'cond-1', target: 'task-a', sourceHandle: 'true', targetHandle: 'target' },
        { id: '2', source: 'cond-1', target: 'task-b', sourceHandle: 'true', targetHandle: 'target' },
        { id: '3', source: 'cond-1', target: 'task-c', sourceHandle: 'false', targetHandle: 'target' },
      ]

      const result = EdgeHelpers.findEdgesBySourceHandle('cond-1', edges, 'true')

      expect(result).toHaveLength(2)
      expect(result.map((e) => e.target)).toEqual(['task-a', 'task-b'])
    })

    it('handles empty edges array', () => {
      const result = EdgeHelpers.findEdgesBySourceHandle('loop-1', [], 'loop')

      expect(result).toHaveLength(0)
    })
  })

  describe('hasTargetStarted', () => {
    it('returns false when edge is undefined', () => {
      const activityStates = new Map<string, ActivityState>()

      const result = EdgeHelpers.hasTargetStarted(undefined, activityStates)

      expect(result).toBe(false)
    })

    it('returns false when target has pending status', () => {
      const edge: EdgeConnection = {
        id: '1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'done',
        targetHandle: 'target',
      }
      const activityStates = new Map<string, ActivityState>([
        ['task-1', { activityId: 'task-1', status: 'pending', startedAt: null, completedAt: null }],
      ])

      const result = EdgeHelpers.hasTargetStarted(edge, activityStates)

      expect(result).toBe(false)
    })

    it('returns false when target not in activity states', () => {
      const edge: EdgeConnection = {
        id: '1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'done',
        targetHandle: 'target',
      }
      const activityStates = new Map<string, ActivityState>()

      const result = EdgeHelpers.hasTargetStarted(edge, activityStates)

      expect(result).toBe(false)
    })

    it('returns true when target has running status', () => {
      const edge: EdgeConnection = {
        id: '1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'done',
        targetHandle: 'target',
      }
      const activityStates = new Map<string, ActivityState>([
        ['task-1', { activityId: 'task-1', status: 'running', startedAt: '2024-01-01T00:00:00Z', completedAt: null }],
      ])

      const result = EdgeHelpers.hasTargetStarted(edge, activityStates)

      expect(result).toBe(true)
    })

    it('returns true when target has completed status', () => {
      const edge: EdgeConnection = {
        id: '1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'done',
        targetHandle: 'target',
      }
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

      const result = EdgeHelpers.hasTargetStarted(edge, activityStates)

      expect(result).toBe(true)
    })

    it('returns true when target has failed status', () => {
      const edge: EdgeConnection = {
        id: '1',
        source: 'loop-1',
        target: 'task-1',
        sourceHandle: 'done',
        targetHandle: 'target',
      }
      const activityStates = new Map<string, ActivityState>([
        [
          'task-1',
          {
            activityId: 'task-1',
            status: 'failed',
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:01:00Z',
            errorDetails: 'Test error',
          },
        ],
      ])

      const result = EdgeHelpers.hasTargetStarted(edge, activityStates)

      expect(result).toBe(true)
    })
  })

  describe('getIncomingEdges', () => {
    it('returns edges targeting the specified activity', () => {
      const edges: EdgeConnection[] = [
        { id: '1', source: 'task-1', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
        { id: '2', source: 'task-2', target: 'converge-1', sourceHandle: 'source', targetHandle: 'target' },
        { id: '3', source: 'task-3', target: 'task-4', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = EdgeHelpers.getIncomingEdges('converge-1', edges)

      expect(result).toHaveLength(2)
      expect(result.map((e) => e.source)).toEqual(['task-1', 'task-2'])
    })

    it('returns empty array when no incoming edges', () => {
      const edges: EdgeConnection[] = [
        { id: '1', source: 'task-1', target: 'task-2', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = EdgeHelpers.getIncomingEdges('task-1', edges)

      expect(result).toHaveLength(0)
    })

    it('handles empty edges array', () => {
      const result = EdgeHelpers.getIncomingEdges('task-1', [])

      expect(result).toHaveLength(0)
    })

    it('returns edges with different source handles', () => {
      const edges: EdgeConnection[] = [
        { id: '1', source: 'loop-1', target: 'loop-1', sourceHandle: 'source', targetHandle: 'end' },
        { id: '2', source: 'task-1', target: 'loop-1', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = EdgeHelpers.getIncomingEdges('loop-1', edges)

      expect(result).toHaveLength(2)
    })
  })

  describe('getOutgoingEdges', () => {
    it('returns edges from the specified activity', () => {
      const edges: EdgeConnection[] = [
        { id: '1', source: 'converge-1', target: 'task-1', sourceHandle: 'source', targetHandle: 'target' },
        { id: '2', source: 'converge-1', target: 'task-2', sourceHandle: 'source', targetHandle: 'target' },
        { id: '3', source: 'task-3', target: 'task-4', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = EdgeHelpers.getOutgoingEdges('converge-1', edges)

      expect(result).toHaveLength(2)
      expect(result.map((e) => e.target)).toEqual(['task-1', 'task-2'])
    })

    it('returns empty array when no outgoing edges', () => {
      const edges: EdgeConnection[] = [
        { id: '1', source: 'task-1', target: 'task-2', sourceHandle: 'source', targetHandle: 'target' },
      ]

      const result = EdgeHelpers.getOutgoingEdges('task-2', edges)

      expect(result).toHaveLength(0)
    })

    it('handles empty edges array', () => {
      const result = EdgeHelpers.getOutgoingEdges('task-1', [])

      expect(result).toHaveLength(0)
    })

    it('returns edges with different source handles', () => {
      const edges: EdgeConnection[] = [
        { id: '1', source: 'loop-1', target: 'task-1', sourceHandle: 'loop', targetHandle: 'target' },
        { id: '2', source: 'loop-1', target: 'task-2', sourceHandle: 'done', targetHandle: 'target' },
      ]

      const result = EdgeHelpers.getOutgoingEdges('loop-1', edges)

      expect(result).toHaveLength(2)
      expect(result.map((e) => e.sourceHandle)).toEqual(['loop', 'done'])
    })
  })
})
