import type { ActivityState } from '../../../automations/execution/types'
import type { EdgeConnection } from '../../types/edge'

/**
 * Utility class for common edge operations in execution state inference.
 *
 * This module provides shared utilities for filtering and analyzing edges
 * to determine execution state of workflow steps (React Flow nodes).
 */
export class EdgeHelpers {
  /**
   * Find all edges from a specific activity using a specific source handle.
   *
   * @param activityId - The source activity ID
   * @param edges - All edges in the workflow
   * @param handle - The source handle to filter by (e.g., 'done', 'loop', 'true', 'false')
   * @returns Array of edges matching the criteria
   *
   * @example
   * // Find loop edges from a loop node
   * const loopEdges = EdgeHelpers.findEdgesBySourceHandle('loop-1', edges, 'loop')
   *
   * @example
   * // Find "done" edges from a loop node
   * const doneEdges = EdgeHelpers.findEdgesBySourceHandle('loop-1', edges, 'done')
   */
  static findEdgesBySourceHandle(activityId: string, edges: EdgeConnection[], handle: string): EdgeConnection[] {
    return edges.filter((e) => e.source === activityId && e.sourceHandle === handle)
  }

  /**
   * Check if the target of an edge has started execution.
   *
   * An activity is considered "started" if it exists in the activity states map
   * and has a status other than 'pending'.
   *
   * @param edge - The edge to check (can be undefined)
   * @param activityStates - Map of activity IDs to their execution states
   * @returns true if the target has started, false otherwise
   *
   * @example
   * const doneEdge = edges.find(e => e.source === 'loop-1' && e.sourceHandle === 'done')
   * if (EdgeHelpers.hasTargetStarted(doneEdge, activityStates)) {
   *   // Loop has completed - the "done" path was taken
   * }
   */
  static hasTargetStarted(edge: EdgeConnection | undefined, activityStates: Map<string, ActivityState>): boolean {
    if (!edge) return false

    const targetState = activityStates.get(edge.target)
    return targetState !== undefined && targetState.status !== 'pending'
  }

  /**
   * Get all edges that target a specific activity.
   *
   * @param activityId - The target activity ID
   * @param edges - All edges in the workflow
   * @returns Array of incoming edges
   *
   * @example
   * // Check if a converge node has any incoming activities running
   * const incomingEdges = EdgeHelpers.getIncomingEdges('converge-1', edges)
   * const hasRunningInput = incomingEdges.some(edge =>
   *   activityStates.get(edge.source)?.status === 'running'
   * )
   */
  static getIncomingEdges(activityId: string, edges: EdgeConnection[]): EdgeConnection[] {
    return edges.filter((e) => e.target === activityId)
  }

  /**
   * Get all edges from a specific activity.
   *
   * @param activityId - The source activity ID
   * @param edges - All edges in the workflow
   * @returns Array of outgoing edges
   *
   * @example
   * // Check if any path from a converge node has started
   * const outgoingEdges = EdgeHelpers.getOutgoingEdges('converge-1', edges)
   * const hasStartedOutput = outgoingEdges.some(edge =>
   *   activityStates.get(edge.target)?.status !== 'pending'
   * )
   */
  static getOutgoingEdges(activityId: string, edges: EdgeConnection[]): EdgeConnection[] {
    return edges.filter((e) => e.source === activityId)
  }
}
