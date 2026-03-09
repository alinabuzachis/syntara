import { ActivityTypeEnum, type Activity } from '@ansible/nexus-contracts'

import type { ActivityState } from '../../../automations/execution/types'
import type { EdgeConnection } from '../../types/edge'

import { ACTIVITY_STATUS, TERMINAL_ACTIVITY_STATUSES, isBranchHandle } from './executionHelpers'
import {
  ConditionalNodeStateInferrer,
  ConvergeNodeStateInferrer,
  type ExecutionState,
  LoopNodeStateInferrer,
  type NodeStateInferrer,
} from './nodeStateInference'
import { WorkflowTraversal } from './traversal'

/**
 * Activity with execution metadata attached.
 */
export type ActivityWithMetadata = Activity & {
  metadata?: {
    __showExecutionBadge?: boolean
    [key: string]: unknown
  }
  __executionState?: ExecutionState
}

/**
 * Orchestrator for enriching workflow activities with execution state.
 *
 * This class completely encapsulates all execution state inference logic,
 * making it independent from BuilderFlow.tsx. It uses a strategy pattern
 * to delegate node-specific inference to specialized inferrer classes.
 *
 * @example
 * const enricher = new ExecutionStateEnricher()
 *
 * const enrichedActivity = enricher.enrichActivity(
 *   activity,
 *   activityStates,
 *   edges
 * )
 *
 * const edgeStatus = enricher.determineEdgeStatus(
 *   { source: 'task-1', target: 'task-2' },
 *   activityStates
 * )
 */
export class ExecutionStateEnricher {
  private nodeInferrers: Map<string, NodeStateInferrer>

  constructor() {
    // Register node-specific state inferrers
    this.nodeInferrers = new Map([
      ['loop', new LoopNodeStateInferrer()],
      ['converge', new ConvergeNodeStateInferrer()],
      ['condition', new ConditionalNodeStateInferrer()],
      ['approval', new ConditionalNodeStateInferrer()], // Approval uses same logic as conditional
    ])
  }

  /**
   * Enrich an activity with execution state for visualization.
   *
   * This method:
   * 1. Adds execution badge flag to metadata
   * 2. Adds backend state if available (direct from activityStates)
   * 3. Infers state for structural nodes (loop, converge, conditional) if no backend state
   * 4. Marks nodes as skipped when on non-taken branches
   * 5. Sets default pending state for structural nodes with no other state
   *
   * @param activity - The activity to enrich
   * @param executionStatus - Current execution status (null if not in execution view)
   * @param activityStates - Map of activity IDs to their execution states from backend
   * @param edges - All edges in the workflow
   * @returns Activity enriched with execution metadata
   */
  enrichActivity(
    activity: Activity,
    executionStatus: string | null | undefined,
    activityStates: Map<string, ActivityState>,
    edges: EdgeConnection[]
  ): ActivityWithMetadata {
    // If not in execution view, return as-is
    if (!executionStatus) {
      return activity as ActivityWithMetadata
    }

    // Add execution badge flag to metadata
    const baseMetadata = (activity as ActivityWithMetadata).metadata ?? {}
    let enrichedActivity: ActivityWithMetadata = {
      ...activity,
      metadata: { ...baseMetadata, __showExecutionBadge: true },
    }

    // Step 1: Add direct backend state if available
    const activityState = activityStates.get(activity.id)
    if (activityState) {
      enrichedActivity = {
        ...enrichedActivity,
        __executionState: {
          status: activityState.status,
          started_at: activityState.startedAt ?? undefined,
          completed_at: activityState.completedAt ?? undefined,
          error_details: activityState.errorDetails ?? undefined,
        },
      }

      return enrichedActivity
    }

    // Step 2: Try to infer state for structural nodes
    const inferrer = this.nodeInferrers.get(activity.type)
    if (inferrer) {
      const inferredState = inferrer.inferState(activity, edges, activityStates)

      if (inferredState) {
        enrichedActivity = {
          ...enrichedActivity,
          __executionState: inferredState,
        }

        return enrichedActivity
      }
    }

    // Step 3: Check if node should be marked as skipped
    if (WorkflowTraversal.shouldMarkAsSkipped(activity.id, activityStates, edges)) {
      enrichedActivity = {
        ...enrichedActivity,
        __executionState: {
          status: ACTIVITY_STATUS.SKIPPED,
          started_at: undefined,
          completed_at: undefined,
          error_details: undefined,
        },
      }

      return enrichedActivity
    }

    // Step 4: Set default pending state for structural nodes
    // (only for nodes with inferrers - loop, converge, conditional, approval)
    if (inferrer) {
      enrichedActivity = {
        ...enrichedActivity,
        __executionState: {
          status: ACTIVITY_STATUS.PENDING,
          started_at: undefined,
          completed_at: undefined,
          error_details: undefined,
        },
      }
    }

    return enrichedActivity
  }

  /**
   * Enrich trigger node data with execution state.
   *
   * A trigger is considered:
   * - 'completed' if ANY connected node has started (status !== 'pending')
   * - 'pending' otherwise
   *
   * @param triggerId - The trigger node ID (e.g., 'trigger-0')
   * @param executionStatus - Current execution status (null if not in execution view)
   * @param edges - All edges in the workflow
   * @param activityStates - Map of activity states from execution store
   * @returns Trigger data enriched with execution metadata
   */
  enrichTriggerNode<T extends Record<string, unknown>>(
    triggerId: string,
    triggerData: T,
    executionStatus: string | null | undefined,
    edges: EdgeConnection[],
    activityStates: Map<string, ActivityState>
  ): T & { metadata?: { __showExecutionBadge?: boolean }; __executionState?: ExecutionState } {
    // If not in execution view, return as-is
    if (!executionStatus) {
      return triggerData
    }

    // Find all edges from this trigger
    const outgoingEdges = edges.filter((e) => e.source === triggerId)

    // Check if any target node has started
    const anyTargetStarted = outgoingEdges.some((edge) => {
      const targetState = activityStates.get(edge.target)
      return targetState && targetState.status !== ACTIVITY_STATUS.PENDING
    })

    // Trigger is 'completed' if any connected node started, 'pending' otherwise
    const status = anyTargetStarted ? ACTIVITY_STATUS.COMPLETED : ACTIVITY_STATUS.PENDING

    return {
      ...triggerData,
      metadata: {
        ...(triggerData.metadata as Record<string, unknown> | undefined),
        __showExecutionBadge: true,
      },
      __executionState: {
        status,
        started_at: undefined,
        completed_at: undefined,
        error_details: undefined,
      },
    }
  }

  /**
   * Determine execution status for an edge.
   *
   * For branching edges (conditional, approval, loop), the edge is "passed" if the target
   * has started, indicating this branch was actually taken during execution.
   *
   * For converge node outgoing edges, the edge is "passed" if the target has started,
   * showing that execution has moved past the converge point.
   *
   * For trigger edges, the edge is "passed" if the trigger is completed (any target started).
   *
   * For regular edges, the edge is "passed" if the source activity has started.
   *
   * This determines visual styling:
   * - Passed edges: Solid line (execution traversed this path)
   * - Pending edges: Dashed line (execution hasn't reached this yet)
   *
   * @param edge - The edge to determine status for
   * @param activityStates - Map of activity states from execution store
   * @param activities - Optional list of activities to check source node type
   * @returns 'passed' if edge was traversed, 'pending' otherwise
   */
  determineEdgeStatus(
    edge: { source: string; target: string; sourceHandle?: string | null },
    activityStates: Map<string, ActivityState>,
    activities?: Activity[]
  ): 'passed' | 'pending' {
    // For trigger edges, check if target has started
    // Edge is "passed" when trigger has fired (i.e., when target node started)
    const isSourceTrigger = edge.source.startsWith('trigger-')
    if (isSourceTrigger) {
      const targetState = activityStates.get(edge.target)
      return targetState && targetState.status !== ACTIVITY_STATUS.PENDING ? 'passed' : 'pending'
    }

    // For branching nodes (conditional, approval, or loop), check if target has started
    // This determines which branch was actually taken
    if (isBranchHandle(edge.sourceHandle)) {
      const targetState = activityStates.get(edge.target)
      // If target is no longer pending, this branch was taken
      return targetState && targetState.status !== ACTIVITY_STATUS.PENDING ? 'passed' : 'pending'
    }

    // For converge nodes, check if target has started (not source)
    // This shows when execution has actually moved past the converge point
    let isSourceConverge: boolean
    if (activities) {
      // Check activity type directly (most reliable)
      const sourceActivity = activities.find((a) => a.id === edge.source)
      isSourceConverge = sourceActivity?.type === ActivityTypeEnum.CONVERGE
    } else {
      // Fallback to ID pattern matching
      isSourceConverge = edge.source.startsWith('converge-')
    }

    if (isSourceConverge) {
      const targetState = activityStates.get(edge.target)
      return targetState && targetState.status !== ACTIVITY_STATUS.PENDING ? 'passed' : 'pending'
    }

    // For regular edges, edge is "passed" if source activity completed/failed/cancelled
    // This matches the logic in useEdgeStatus.deriveEdgeStatus
    const sourceState = activityStates.get(edge.source)
    if (sourceState) {
      return TERMINAL_ACTIVITY_STATUSES.includes(sourceState.status) ? 'passed' : 'pending'
    }

    return 'pending'
  }
}
