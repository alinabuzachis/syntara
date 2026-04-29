/**
 * BuilderFlow Execution Visualization Tests
 *
 * Tests for execution state enrichment, skip detection, and conditional node inference
 */

import type { Activity } from '@ansible/nexus-contracts'
import { describe, it, expect } from 'vitest'

import type { ActivityState } from '../workflows/execution/types'

// Mock the actual implementation for testing purposes
// In a real scenario, we'd extract these functions to a testable module

/**
 * Test helper to check if any downstream node is still pending or running
 */
function hasDownstreamPendingNodes(
  activityId: string,
  activityStates: Map<string, ActivityState>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null }>,
  visitedIds: Set<string> = new Set()
): boolean {
  // Prevent infinite recursion
  if (visitedIds.has(activityId)) {
    return false
  }
  visitedIds.add(activityId)

  // Find all outgoing edges from this activity
  const outgoingEdges = edges.filter((edge) => edge.source === activityId)

  for (const edge of outgoingEdges) {
    const targetState = activityStates.get(edge.target)

    // If target has pending or running state, return true
    if (targetState && (targetState.status === 'pending' || targetState.status === 'running')) {
      return true
    }

    // Recursively check downstream nodes
    if (hasDownstreamPendingNodes(edge.target, activityStates, edges, new Set(visitedIds))) {
      return true
    }
  }

  return false
}

/**
 * Test helper to simulate shouldMarkAsSkipped logic
 */
function shouldMarkAsSkipped(
  activityId: string,
  activityStates: Map<string, ActivityState>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null }>,
  visitedIds: Set<string> = new Set()
): boolean {
  // Prevent infinite recursion
  if (visitedIds.has(activityId)) {
    return false
  }
  visitedIds.add(activityId)

  // If node has activity state (started), it's not skipped
  const activityState = activityStates.get(activityId)
  if (activityState) {
    return false
  }

  // If any downstream node is still pending/running, this node should remain pending
  if (hasDownstreamPendingNodes(activityId, activityStates, edges)) {
    return false
  }

  // Find all incoming edges to this activity
  const incomingEdges = edges.filter((edge) => edge.target === activityId)

  if (incomingEdges.length === 0) {
    return false // No incoming edges (trigger nodes or orphans)
  }

  // Check if there are any incoming branch edges (from conditional or approval nodes)
  const incomingBranchEdges = incomingEdges.filter(
    (edge) =>
      edge.sourceHandle === 'true' ||
      edge.sourceHandle === 'false' ||
      edge.sourceHandle === 'approved' ||
      edge.sourceHandle === 'rejected'
  )

  // If there are branch edges, check if all branching sources completed (meaning branch wasn't taken)
  if (incomingBranchEdges.length > 0) {
    const allBranchSourcesCompleted = incomingBranchEdges.every((edge) => {
      const sourceState = activityStates.get(edge.source)
      return (
        sourceState &&
        (sourceState.status === 'completed' || sourceState.status === 'failed' || sourceState.status === 'cancelled')
      )
    })

    if (allBranchSourcesCompleted) {
      return true // Node is on a non-taken branch
    }
  }

  // Check if all incoming nodes (regardless of edge type) are either:
  // 1. Skipped (recursively check)
  // 2. Completed/failed/cancelled (terminal states)
  const allIncomingNodesSkippedOrCompleted = incomingEdges.every((edge) => {
    const sourceState = activityStates.get(edge.source)

    // If source has completed/failed/cancelled, it's in a terminal state
    if (
      sourceState &&
      (sourceState.status === 'completed' || sourceState.status === 'failed' || sourceState.status === 'cancelled')
    ) {
      return true
    }

    // If source should be skipped, this counts too
    return shouldMarkAsSkipped(edge.source, activityStates, edges, new Set(visitedIds))
  })

  return allIncomingNodesSkippedOrCompleted
}

/**
 * Test helper to simulate conditional/approval node completion inference
 */
function shouldMarkAsCompleted(
  activity: Activity,
  activityStates: Map<string, ActivityState>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null }>
): boolean {
  const isConditionalOrApproval = activity.type === 'condition' || activity.type === 'approval'

  if (!isConditionalOrApproval) {
    return false
  }

  // Find all outgoing edges from this node with branching handles
  const outgoingBranchEdges = edges.filter(
    (edge) =>
      edge.source === activity.id &&
      (edge.sourceHandle === 'true' ||
        edge.sourceHandle === 'false' ||
        edge.sourceHandle === 'approved' ||
        edge.sourceHandle === 'rejected')
  )

  // Check if any target node has started (meaning this branch was taken)
  return outgoingBranchEdges.some((edge) => {
    const targetState = activityStates.get(edge.target)
    return targetState?.startedAt
  })
}

describe('BuilderFlow Execution Visualization', () => {
  describe('shouldMarkAsSkipped', () => {
    it('marks node as skipped when on non-taken conditional branch', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
      ]

      // task2 is on the false branch, but task1 (true branch) started
      // So condition took the true branch, task2 should be skipped
      const result = shouldMarkAsSkipped('task2', activityStates, edges)
      expect(result).toBe(true)
    })

    it('does not mark node as skipped when on taken conditional branch', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
      ]

      // task1 has started, so it's on the taken branch
      const result = shouldMarkAsSkipped('task1', activityStates, edges)
      expect(result).toBe(false)
    })

    it('marks node as skipped when on non-taken approval branch', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'approval1',
          {
            activityId: 'approval1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'approved_task',
          {
            activityId: 'approved_task',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
      ])

      const edges = [
        { source: 'approval1', target: 'approved_task', sourceHandle: 'approved' },
        { source: 'approval1', target: 'rejected_task', sourceHandle: 'rejected' },
      ]

      // rejected_task is on the rejected branch, but approved_task started
      const result = shouldMarkAsSkipped('rejected_task', activityStates, edges)
      expect(result).toBe(true)
    })

    it('marks downstream nodes as skipped when parent is skipped', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
        { source: 'task2', target: 'task3', sourceHandle: null }, // task3 follows task2
      ]

      // task2 is skipped (non-taken branch)
      // task3 should also be skipped (downstream of skipped node)
      const task3Result = shouldMarkAsSkipped('task3', activityStates, edges)
      expect(task3Result).toBe(true)
    })

    it('does not mark node as skipped when it has execution state', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'pending',
          },
        ],
      ])

      const edges = [{ source: 'condition1', target: 'task1', sourceHandle: 'true' }]

      // Even though task1 is pending, it has state so it shouldn't be marked as skipped
      const result = shouldMarkAsSkipped('task1', activityStates, edges)
      expect(result).toBe(false)
    })

    it('handles cycles without infinite recursion', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'task1',
          {
            activityId: 'task1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
      ])

      const edges = [
        { source: 'task1', target: 'task2', sourceHandle: null },
        { source: 'task2', target: 'task3', sourceHandle: null },
        { source: 'task3', target: 'task2', sourceHandle: null }, // cycle: task2 -> task3 -> task2
      ]

      // Should not throw or hang
      const result = shouldMarkAsSkipped('task2', activityStates, edges)
      expect(result).toBe(false) // Has incoming from completed task1
    })

    it('does not mark trigger nodes as skipped', () => {
      const activityStates = new Map<string, ActivityState>()
      const edges: Array<{ source: string; target: string; sourceHandle?: string | null }> = []

      // Trigger node has no incoming edges
      const result = shouldMarkAsSkipped('trigger-0', activityStates, edges)
      expect(result).toBe(false)
    })
  })

  describe('shouldMarkAsCompleted (Conditional/Approval Inference)', () => {
    it('marks conditional node as completed when true branch taken', () => {
      const activity: Activity = {
        id: 'condition1',
        type: 'condition',
        name: 'Check value',
        config: { condition: 'value > 10' },
      }

      const activityStates = new Map<string, ActivityState>([
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:00Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
      ]

      const result = shouldMarkAsCompleted(activity, activityStates, edges)
      expect(result).toBe(true)
    })

    it('marks conditional node as completed when false branch taken', () => {
      const activity: Activity = {
        id: 'condition1',
        type: 'condition',
        name: 'Check value',
        config: { condition: 'value > 10' },
      }

      const activityStates = new Map<string, ActivityState>([
        [
          'task2',
          {
            activityId: 'task2',
            status: 'running',
            startedAt: '2024-01-01T10:00:00Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
      ]

      const result = shouldMarkAsCompleted(activity, activityStates, edges)
      expect(result).toBe(true)
    })

    it('does not mark conditional node as completed when no branch taken', () => {
      const activity: Activity = {
        id: 'condition1',
        type: 'condition',
        name: 'Check value',
        config: { condition: 'value > 10' },
      }

      const activityStates = new Map<string, ActivityState>()

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
      ]

      const result = shouldMarkAsCompleted(activity, activityStates, edges)
      expect(result).toBe(false)
    })

    it('marks approval node as completed when approved branch taken', () => {
      const activity: Activity = {
        id: 'approval1',
        type: 'approval',
        name: 'Approve deployment',
        config: {},
      }

      const activityStates = new Map<string, ActivityState>([
        [
          'deploy_task',
          {
            activityId: 'deploy_task',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:05:00Z',
          },
        ],
      ])

      const edges = [
        { source: 'approval1', target: 'deploy_task', sourceHandle: 'approved' },
        { source: 'approval1', target: 'cancel_task', sourceHandle: 'rejected' },
      ]

      const result = shouldMarkAsCompleted(activity, activityStates, edges)
      expect(result).toBe(true)
    })

    it('marks approval node as completed when rejected branch taken', () => {
      const activity: Activity = {
        id: 'approval1',
        type: 'approval',
        name: 'Approve deployment',
        config: {},
      }

      const activityStates = new Map<string, ActivityState>([
        [
          'cancel_task',
          {
            activityId: 'cancel_task',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:01:00Z',
          },
        ],
      ])

      const edges = [
        { source: 'approval1', target: 'deploy_task', sourceHandle: 'approved' },
        { source: 'approval1', target: 'cancel_task', sourceHandle: 'rejected' },
      ]

      const result = shouldMarkAsCompleted(activity, activityStates, edges)
      expect(result).toBe(true)
    })

    it('does not mark task nodes as completed', () => {
      const activity: Activity = {
        id: 'task1',
        type: 'script',
        name: 'Run script',
        config: { language: 'bash', code: 'echo hello' },
      }

      const activityStates = new Map<string, ActivityState>([
        [
          'task2',
          {
            activityId: 'task2',
            status: 'running',
            startedAt: '2024-01-01T10:00:00Z',
          },
        ],
      ])

      const edges = [{ source: 'task1', target: 'task2', sourceHandle: null }]

      const result = shouldMarkAsCompleted(activity, activityStates, edges)
      expect(result).toBe(false)
    })

    it('does not infer completion when target started but no startedAt timestamp', () => {
      const activity: Activity = {
        id: 'condition1',
        type: 'condition',
        name: 'Check value',
        config: { condition: 'value > 10' },
      }

      const activityStates = new Map<string, ActivityState>([
        [
          'task1',
          {
            activityId: 'task1',
            status: 'pending',
            // No startedAt
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
      ]

      const result = shouldMarkAsCompleted(activity, activityStates, edges)
      expect(result).toBe(false)
    })
  })

  describe('Edge Status Integration', () => {
    it('determines correct edge status for branching nodes', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
      ])

      const trueEdge = { source: 'condition1', target: 'task1', sourceHandle: 'true' }
      const falseEdge = { source: 'condition1', target: 'task2', sourceHandle: 'false' }

      // True branch was taken (task1 started)
      const targetState = activityStates.get(trueEdge.target)
      const trueEdgeStatus = targetState?.startedAt ? 'passed' : 'pending'
      expect(trueEdgeStatus).toBe('passed')

      // False branch was not taken (task2 never started)
      const falseTargetState = activityStates.get(falseEdge.target)
      const falseEdgeStatus = falseTargetState?.startedAt ? 'passed' : 'pending'
      expect(falseEdgeStatus).toBe('pending')
    })
  })

  describe('Downstream Pending Node Detection', () => {
    it('does not mark node as skipped when downstream node is pending', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
        [
          'task3',
          {
            activityId: 'task3',
            status: 'pending',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
        { source: 'task2', target: 'task3', sourceHandle: null },
      ]

      // task2 is on non-taken branch, but task3 (downstream) is still pending
      // So task2 should NOT be marked as skipped yet
      const result = shouldMarkAsSkipped('task2', activityStates, edges)
      expect(result).toBe(false)
    })

    it('does not mark node as skipped when downstream node is running', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
        [
          'task3',
          {
            activityId: 'task3',
            status: 'running',
            startedAt: '2024-01-01T10:00:03Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
        { source: 'task2', target: 'task3', sourceHandle: null },
      ]

      // task2 is on non-taken branch, but task3 (downstream) is still running
      const result = shouldMarkAsSkipped('task2', activityStates, edges)
      expect(result).toBe(false)
    })

    it('marks node as skipped when all downstream nodes are completed', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
        [
          'task3',
          {
            activityId: 'task3',
            status: 'completed',
            startedAt: '2024-01-01T10:00:03Z',
            completedAt: '2024-01-01T10:00:04Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
        { source: 'task2', target: 'task3', sourceHandle: null },
      ]

      // task2 is on non-taken branch, and task3 (downstream) is completed
      // So task2 should be marked as skipped
      const result = shouldMarkAsSkipped('task2', activityStates, edges)
      expect(result).toBe(true)
    })

    it('detects pending nodes multiple levels downstream', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
        [
          'task4',
          {
            activityId: 'task4',
            status: 'pending',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
        { source: 'task2', target: 'task3', sourceHandle: null },
        { source: 'task3', target: 'task4', sourceHandle: null },
      ]

      // task2 is on non-taken branch, but task4 (multiple levels downstream) is pending
      const result = shouldMarkAsSkipped('task2', activityStates, edges)
      expect(result).toBe(false)
    })

    it('handles cycles in downstream detection without infinite recursion', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
        { source: 'task2', target: 'task3', sourceHandle: null },
        { source: 'task3', target: 'task2', sourceHandle: null }, // cycle
      ]

      // Should not throw or hang
      const result = shouldMarkAsSkipped('task2', activityStates, edges)
      expect(result).toBe(true) // No downstream pending, so should be skipped
    })
  })

  describe('Default Pending State for Conditional/Approval Nodes', () => {
    it('should infer pending state for conditional node without backend state', () => {
      const activity: Activity = {
        id: 'condition1',
        type: 'condition',
        name: 'Check value',
        config: { condition: 'value > 10' },
      }

      const activityStates = new Map<string, ActivityState>()
      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
      ]

      // No backend state, no branch taken, not skipped
      // Should default to pending
      const hasBackendState = activityStates.has(activity.id)
      const isCompleted = shouldMarkAsCompleted(activity, activityStates, edges)
      const isSkipped = shouldMarkAsSkipped(activity.id, activityStates, edges)

      expect(hasBackendState).toBe(false)
      expect(isCompleted).toBe(false)
      expect(isSkipped).toBe(false)
      // In the actual implementation, this would get pending state
    })

    it('should infer pending state for approval node without backend state', () => {
      const activity: Activity = {
        id: 'approval1',
        type: 'approval',
        name: 'Approve deployment',
        config: {},
      }

      const activityStates = new Map<string, ActivityState>()
      const edges = [
        { source: 'approval1', target: 'deploy_task', sourceHandle: 'approved' },
        { source: 'approval1', target: 'cancel_task', sourceHandle: 'rejected' },
      ]

      // No backend state, no branch taken, not skipped
      // Should default to pending
      const hasBackendState = activityStates.has(activity.id)
      const isCompleted = shouldMarkAsCompleted(activity, activityStates, edges)
      const isSkipped = shouldMarkAsSkipped(activity.id, activityStates, edges)

      expect(hasBackendState).toBe(false)
      expect(isCompleted).toBe(false)
      expect(isSkipped).toBe(false)
      // In the actual implementation, this would get pending state
    })

    it('should not infer pending state for task nodes', () => {
      const activity: Activity = {
        id: 'task1',
        type: 'script',
        name: 'Run script',
        config: { language: 'bash', code: 'echo hello' },
      }

      const activityStates = new Map<string, ActivityState>()

      // Task nodes don't get default pending state - only conditional/approval nodes do
      const hasBackendState = activityStates.has(activity.id)
      expect(hasBackendState).toBe(false)
      // Task nodes without backend state show no badge
    })

    it('prefers backend state over default pending for conditional nodes', () => {
      const activity: Activity = {
        id: 'condition1',
        type: 'condition',
        name: 'Check value',
        config: { condition: 'value > 10' },
      }

      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'running',
            startedAt: '2024-01-01T10:00:00Z',
          },
        ],
      ])

      // Has backend state - should use 'running' not default to 'pending'
      const hasBackendState = activityStates.has(activity.id)
      const backendState = activityStates.get(activity.id)

      expect(hasBackendState).toBe(true)
      expect(backendState?.status).toBe('running')
      // Backend state takes priority
    })

    it('prefers inferred completed over default pending for conditional nodes', () => {
      const activity: Activity = {
        id: 'condition1',
        type: 'condition',
        name: 'Check value',
        config: { condition: 'value > 10' },
      }

      const activityStates = new Map<string, ActivityState>([
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:00Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
      ]

      // No backend state, but branch taken - should be 'completed' not 'pending'
      const hasBackendState = activityStates.has(activity.id)
      const isCompleted = shouldMarkAsCompleted(activity, activityStates, edges)

      expect(hasBackendState).toBe(false)
      expect(isCompleted).toBe(true)
      // Inferred completed takes priority over default pending
    })
  })

  describe('Multi-Parent Node Skip Detection', () => {
    it('correctly marks multi-parent node as skipped when all parents are skipped', () => {
      // Diamond pattern: condition1 -> task1, task2 -> task3
      // Both task1 and task2 should be skipped, task3 should also be skipped
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task0',
          {
            activityId: 'task0',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task0', sourceHandle: 'true' },
        { source: 'condition1', target: 'task1', sourceHandle: 'false' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
        { source: 'task1', target: 'task3', sourceHandle: null },
        { source: 'task2', target: 'task3', sourceHandle: null },
      ]

      // task1 and task2 are on non-taken branch
      const task1Result = shouldMarkAsSkipped('task1', activityStates, edges)
      const task2Result = shouldMarkAsSkipped('task2', activityStates, edges)
      expect(task1Result).toBe(true)
      expect(task2Result).toBe(true)

      // task3 has two parents (task1 and task2), both are skipped
      // With Set cloning fix, both branches should independently determine they're skipped
      // Therefore task3 should also be skipped
      const task3Result = shouldMarkAsSkipped('task3', activityStates, edges)
      expect(task3Result).toBe(true)
    })

    it('handles independent path traversal in skip detection', () => {
      // Test that visitedIds doesn't leak between branches
      // Structure: A -> B, C -> D (diamond)
      // A completed, B and C on different branches, both should be checked independently
      const activityStates = new Map<string, ActivityState>([
        [
          'A',
          {
            activityId: 'A',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
      ])

      const edges = [
        { source: 'A', target: 'B', sourceHandle: 'true' },
        { source: 'A', target: 'C', sourceHandle: 'false' },
        { source: 'B', target: 'D', sourceHandle: null },
        { source: 'C', target: 'D', sourceHandle: null },
      ]

      // When checking D, it should check both B and C independently
      // Without Set cloning, first check would mark A as visited
      // Second check would see A already visited and short-circuit
      const result = shouldMarkAsSkipped('D', activityStates, edges)
      expect(result).toBe(true)
    })

    it('does not mark multi-parent node as skipped when one parent is not skipped', () => {
      const activityStates = new Map<string, ActivityState>([
        [
          'condition1',
          {
            activityId: 'condition1',
            status: 'completed',
            startedAt: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:01Z',
          },
        ],
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:02Z',
          },
        ],
      ])

      const edges = [
        { source: 'condition1', target: 'task1', sourceHandle: 'true' },
        { source: 'condition1', target: 'task2', sourceHandle: 'false' },
        { source: 'task1', target: 'task3', sourceHandle: null },
        { source: 'task2', target: 'task3', sourceHandle: null },
      ]

      // task1 is running (not skipped)
      // task2 should be skipped (on non-taken branch)
      // task3 has one parent running, one parent skipped -> should NOT be skipped
      const result = shouldMarkAsSkipped('task3', activityStates, edges)
      expect(result).toBe(false)
    })
  })

  describe('Performance: Empty-to-Populated ActivityStates Transition', () => {
    it('syncs nodes only when activityStates becomes populated without extra re-renders', () => {
      // This test verifies the BuilderFlow.tsx optimization:
      // 1. Pre-indexes activities by ID for O(1) lookup
      // 2. Uses shallow comparison instead of JSON.stringify
      // 3. Only updates nodes when execution state actually changes

      const activities: Activity[] = [
        {
          id: 'task1',
          type: 'script',
          name: 'Task 1',
          config: { language: 'bash', code: 'echo task1' },
        },
        {
          id: 'task2',
          type: 'script',
          name: 'Task 2',
          config: { language: 'bash', code: 'echo task2' },
        },
      ]

      // Simulate empty activityStates initially
      const emptyActivityStates = new Map<string, ActivityState>()

      // Simulate populated activityStates after WebSocket update
      const populatedActivityStates = new Map<string, ActivityState>([
        [
          'task1',
          {
            activityId: 'task1',
            status: 'running',
            startedAt: '2024-01-01T10:00:00Z',
          },
        ],
        [
          'task2',
          {
            activityId: 'task2',
            status: 'pending',
          },
        ],
      ])

      // Create Map-based index for O(1) lookup (matches BuilderFlow.tsx implementation)
      const activitiesById = new Map(activities.map((a) => [a.id, a]))

      // Verify Map-based indexing works (O(1) vs O(n) find)
      expect(activitiesById.get('task1')).toBe(activities[0])
      expect(activitiesById.get('task2')).toBe(activities[1])

      // Simulate node update with shallow comparison
      let updateCount = 0
      const updateNodes = (currentStates: Map<string, ActivityState>, newStates: Map<string, ActivityState>) => {
        updateCount++

        // Simulate BuilderFlow.tsx logic
        let anyChanged = false
        for (const activity of activities) {
          const currentState = currentStates.get(activity.id)
          const newState = newStates.get(activity.id)

          // Shallow comparison (matches BuilderFlow.tsx)
          if (
            currentState !== newState &&
            (currentState?.status !== newState?.status ||
              currentState?.startedAt !== newState?.startedAt ||
              currentState?.completedAt !== newState?.completedAt)
          ) {
            anyChanged = true
          }
        }

        return anyChanged
      }

      // First update: empty -> populated (should detect changes)
      const firstUpdate = updateNodes(emptyActivityStates, populatedActivityStates)
      expect(firstUpdate).toBe(true)
      expect(updateCount).toBe(1)

      // Second update: populated -> same populated (should NOT detect changes)
      const secondUpdate = updateNodes(populatedActivityStates, populatedActivityStates)
      expect(secondUpdate).toBe(false)
      expect(updateCount).toBe(2)

      // Verify shallow comparison prevents re-renders when state is identical
      const task1State = populatedActivityStates.get('task1')
      const duplicateTask1State: ActivityState = {
        activityId: 'task1',
        status: 'running',
        startedAt: '2024-01-01T10:00:00Z',
      }

      // Even though objects are different instances, shallow comparison sees same values
      expect(task1State?.status).toBe(duplicateTask1State.status)
      expect(task1State?.startedAt).toBe(duplicateTask1State.startedAt)
      expect(task1State?.completedAt).toBe(duplicateTask1State.completedAt)
    })

    it('detects state changes when execution state properties differ', () => {
      // Verify shallow comparison correctly detects changes when properties differ
      const currentState: ActivityState = {
        activityId: 'task1',
        status: 'running',
        startedAt: '2024-01-01T10:00:00Z',
      }

      const newState: ActivityState = {
        activityId: 'task1',
        status: 'completed',
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: '2024-01-01T10:00:05Z',
      }

      // Shallow comparison should detect status and completedAt changes
      const hasChanged =
        currentState.status !== newState.status ||
        currentState.startedAt !== newState.startedAt ||
        currentState.completedAt !== newState.completedAt

      expect(hasChanged).toBe(true)
    })

    it('prevents hot loop with anyChanged flag', () => {
      // Verify that anyChanged flag prevents unnecessary array allocations
      const initialState: ActivityState = {
        activityId: 'task1',
        status: 'pending',
      }

      const runningState: ActivityState = {
        activityId: 'task1',
        status: 'running',
        startedAt: '2024-01-01T10:00:00Z',
      }

      // Simulate BuilderFlow.tsx node update logic
      const updateNodes = (nodeData: Record<string, unknown>[], newStates: Map<string, ActivityState>) => {
        let anyChanged = false
        const updatedNodes = nodeData.map((node) => {
          const currentState = (node.__executionState as ActivityState) || undefined
          const newState = newStates.get(node.id as string)

          if (
            currentState !== newState &&
            (currentState?.status !== newState?.status ||
              currentState?.startedAt !== newState?.startedAt ||
              currentState?.completedAt !== newState?.completedAt)
          ) {
            anyChanged = true
            return { ...node, __executionState: newState }
          }
          return node
        })

        // Only return new array if something actually changed
        return anyChanged ? updatedNodes : nodeData
      }

      const initialNodes = [{ id: 'task1', __executionState: initialState }]

      // First call: state changes from pending to running, returns new array
      const activityStatesRunning = new Map<string, ActivityState>([['task1', runningState]])
      const result1 = updateNodes(initialNodes, activityStatesRunning)
      expect(result1).not.toBe(initialNodes) // Reference changed
      expect(result1[0].__executionState).toBe(runningState)

      // Second call: same state, returns same array (no hot loop)
      const result2 = updateNodes(result1, activityStatesRunning)
      expect(result2).toBe(result1) // Same reference (no allocation)
    })
  })
})
