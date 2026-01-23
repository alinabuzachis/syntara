/**
 * Edge Status Hook
 *
 * Derives edge status from source node status for execution visualization.
 * Edge status is computed client-side to reduce WebSocket bandwidth.
 */

import { useMemo } from 'react'

import type { EdgeStatus, NodeStatus } from '../execution/types'
import { useExecutionStore, selectActivityStatus } from '../stores/useExecutionStore'

// ============================================================================
// Edge Status Derivation
// ============================================================================

/**
 * Derive edge status from source node status
 *
 * Edge Status Rules:
 * - 'passed': Edge is traversable/has been traversed (source completed execution)
 * - 'pending': Edge is not yet traversable (source not completed)
 *
 * Terminal states that mark edge as 'passed':
 * - 'success': Source completed successfully
 * - 'error': Source failed (but execution continued)
 * - 'cancelled': Source was cancelled (execution may continue via other paths)
 * - 'completed': Source finished execution (general completion status)
 *
 * Non-terminal states that mark edge as 'pending':
 * - 'pending': Source not started
 * - 'running': Source currently executing
 * - 'skipped': Source was skipped (edge may become passed if workflow continues)
 *
 * @param sourceStatus - Status of the source node
 * @returns Edge status derived from source node
 */
export function deriveEdgeStatus(sourceStatus: NodeStatus): EdgeStatus {
  const passedStatuses: NodeStatus[] = ['success', 'error', 'cancelled', 'completed']
  return passedStatuses.includes(sourceStatus) ? 'passed' : 'pending'
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * Hook to get derived edge status for a specific edge
 *
 * @param sourceNodeId - Activity ID of the source node
 * @returns Edge status derived from source node status
 *
 * @example
 * ```tsx
 * function CustomEdge({ source }: EdgeProps) {
 *   const edgeStatus = useEdgeStatus(source)
 *   const strokeColor = edgeStatus === 'passed' ? 'green' : 'gray'
 *   return <path stroke={strokeColor} />
 * }
 * ```
 */
export function useEdgeStatus(sourceNodeId: string): EdgeStatus {
  // Get source node status from store
  const sourceStatus = useExecutionStore(selectActivityStatus(sourceNodeId))

  // Derive edge status (memoized to prevent unnecessary re-renders)
  const edgeStatus = useMemo(() => {
    // Default to 'pending' if source node not found
    if (!sourceStatus) {
      return 'pending'
    }

    return deriveEdgeStatus(sourceStatus)
  }, [sourceStatus])

  return edgeStatus
}

/**
 * Hook to get derived edge statuses for multiple edges
 *
 * More efficient than calling useEdgeStatus multiple times when you need
 * status for many edges at once.
 *
 * @param edges - Array of edge definitions with source node IDs
 * @returns Map of edge ID to edge status
 *
 * @example
 * ```tsx
 * function WorkflowGraph({ edges }: Props) {
 *   const edgeStatuses = useEdgeStatuses(edges)
 *
 *   return edges.map(edge => (
 *     <Edge
 *       key={edge.id}
 *       status={edgeStatuses.get(edge.id)}
 *       {...edge}
 *     />
 *   ))
 * }
 * ```
 */
export function useEdgeStatuses(edges: Array<{ id: string; source: string }>): Map<string, EdgeStatus> {
  // Get all activity statuses once
  const allActivityStates = useExecutionStore((state) => state.activityStates)

  // Derive edge statuses (memoized based on activity states)
  const edgeStatuses = useMemo(() => {
    const statusMap = new Map<string, EdgeStatus>()

    for (const edge of edges) {
      const activityState = allActivityStates.get(edge.source)
      const sourceStatus = activityState?.status
      const edgeStatus = sourceStatus ? deriveEdgeStatus(sourceStatus) : 'pending'
      statusMap.set(edge.id, edgeStatus)
    }

    return statusMap
  }, [edges, allActivityStates])

  return edgeStatuses
}
