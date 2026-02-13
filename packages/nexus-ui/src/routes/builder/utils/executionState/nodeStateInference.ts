import { EdgeHandleEnum, type Activity, type ActivityState, type WorkflowAPI } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../../types/edge'

import { EdgeHelpers } from './edgeHelpers'
import { isTerminalState } from './executionHelpers'

type ActivityStatus = WorkflowAPI.components['schemas']['ActivityStatus']

/**
 * Execution state that can be inferred from workflow structure.
 */
export interface ExecutionState {
  status: ActivityStatus
  started_at?: string
  completed_at?: string
  error_details?: string
}

/**
 * Interface for node-specific execution state inference.
 *
 * Each node type (loop, converge, conditional) has different logic
 * for determining its execution state based on connected nodes.
 */
export interface NodeStateInferrer {
  /**
   * Infer execution state for a node based on its connections and neighbor states.
   *
   * @param activity - The activity to infer state for
   * @param edges - All edges in the workflow
   * @param activityStates - Map of activity IDs to their execution states
   * @returns Inferred execution state, or null if state cannot be determined
   */
  inferState(
    activity: Activity,
    edges: EdgeConnection[],
    activityStates: Map<string, ActivityState>
  ): ExecutionState | null
}

/**
 * Infers execution state for loop nodes.
 *
 * Loop nodes have two outgoing handles:
 * - 'loop': Points to the first activity in the loop body
 * - 'done': Points to the activity after the loop completes
 *
 * State logic:
 * - completed: When the 'done' handle target has started
 * - running: When the 'loop' handle target has started
 * - pending: When neither handle target has started
 */
export class LoopNodeStateInferrer implements NodeStateInferrer {
  inferState(
    activity: Activity,
    edges: EdgeConnection[],
    activityStates: Map<string, ActivityState>
  ): ExecutionState | null {
    // Find edges from loop node's handles
    const doneEdges = EdgeHelpers.findEdgesBySourceHandle(activity.id, edges, 'done')
    const loopEdges = EdgeHelpers.findEdgesBySourceHandle(activity.id, edges, 'loop')

    const doneEdge = doneEdges[0] // Should only be one
    const loopEdge = loopEdges[0] // Should only be one

    // Check if 'done' branch target has started (loop completed)
    const doneTargetStarted = EdgeHelpers.hasTargetStarted(doneEdge, activityStates)

    // Check if 'loop' branch target has started (loop running)
    const loopTargetStarted = EdgeHelpers.hasTargetStarted(loopEdge, activityStates)

    if (doneTargetStarted) {
      // Loop completed - the 'done' path was taken
      return {
        status: 'completed',
        started_at: undefined,
        completed_at: undefined,
        error_details: undefined,
      }
    }

    if (loopTargetStarted) {
      // Loop is running - first activity in loop body has started
      return {
        status: 'running',
        started_at: undefined,
        completed_at: undefined,
        error_details: undefined,
      }
    }

    // Cannot determine state - return null (will default to pending or skipped later)
    return null
  }
}

/**
 * Infers execution state for converge nodes.
 *
 * Converge nodes collect multiple parallel branches into a single point.
 * They have multiple incoming edges and typically one outgoing edge.
 *
 * State logic:
 * - completed: When ALL incoming nodes are in terminal state (completed/failed/cancelled/skipped) OR outgoing node started
 * - running: When at least one incoming node is in terminal state (but not all)
 * - pending: When no incoming nodes are in terminal state
 */
export class ConvergeNodeStateInferrer implements NodeStateInferrer {
  inferState(
    activity: Activity,
    edges: EdgeConnection[],
    activityStates: Map<string, ActivityState>
  ): ExecutionState | null {
    // Find all incoming edges to converge node
    const incomingEdges = EdgeHelpers.getIncomingEdges(activity.id, edges)

    // Find outgoing edges from converge node
    const outgoingEdges = EdgeHelpers.getOutgoingEdges(activity.id, edges)
    const outgoingEdge = outgoingEdges[0] // Typically only one

    // Check if any incoming node is in a terminal state (completed/failed/cancelled/skipped)
    const anyIncomingTerminal = incomingEdges.some((edge) => {
      const sourceState = activityStates.get(edge.source)
      return sourceState && isTerminalState(sourceState.status)
    })

    // Check if all incoming nodes are in a terminal state (completed/failed/cancelled/skipped)
    const allIncomingTerminal = incomingEdges.every((edge) => {
      const sourceState = activityStates.get(edge.source)
      return sourceState && isTerminalState(sourceState.status)
    })

    // Check if the outgoing node has started (not pending)
    const outgoingTargetStarted = EdgeHelpers.hasTargetStarted(outgoingEdge, activityStates)

    // Converge is completed if: all inputs are in terminal state OR output node has started
    if (allIncomingTerminal || outgoingTargetStarted) {
      return {
        status: 'completed',
        started_at: undefined,
        completed_at: undefined,
        error_details: undefined,
      }
    }

    // Converge is running if at least one input is in terminal state but not all
    if (anyIncomingTerminal) {
      return {
        status: 'running',
        started_at: undefined,
        completed_at: undefined,
        error_details: undefined,
      }
    }

    // Cannot determine state - return null (will default to pending or skipped later)
    return null
  }
}

/**
 * Infers execution state for conditional and approval nodes.
 *
 * Conditional nodes have two outgoing handles:
 * - 'true': Taken when condition evaluates to true
 * - 'false': Taken when condition evaluates to false
 *
 * Approval nodes have two outgoing handles:
 * - 'approved': Taken when approval is granted
 * - 'rejected': Taken when approval is denied
 *
 * State logic:
 * - completed: When any branch target has started (a branch was taken)
 * - pending: When no branch targets have started
 */
export class ConditionalNodeStateInferrer implements NodeStateInferrer {
  inferState(
    activity: Activity,
    edges: EdgeConnection[],
    activityStates: Map<string, ActivityState>
  ): ExecutionState | null {
    // Find all outgoing edges from this node with branching handles
    const outgoingBranchEdges = edges.filter((edge) => this.isBranchEdge(edge, activity.id))

    // Check if any target node has started (meaning this branch was taken)
    const anyBranchTaken = outgoingBranchEdges.some((edge) => {
      const targetState = activityStates.get(edge.target)
      return targetState && targetState.startedAt !== null
    })

    if (anyBranchTaken) {
      // Mark the conditional/approval node as completed since a branch was taken
      return {
        status: 'completed',
        started_at: undefined,
        completed_at: undefined,
        error_details: undefined,
      }
    }

    // Cannot determine state - return null (will default to pending or skipped later)
    return null
  }

  private isBranchEdge(edge: EdgeConnection, activityId: string): boolean {
    if (edge.source !== activityId) return false

    return (
      edge.sourceHandle === EdgeHandleEnum.TRUE ||
      edge.sourceHandle === EdgeHandleEnum.FALSE ||
      edge.sourceHandle === EdgeHandleEnum.APPROVED ||
      edge.sourceHandle === EdgeHandleEnum.REJECTED
    )
  }
}
