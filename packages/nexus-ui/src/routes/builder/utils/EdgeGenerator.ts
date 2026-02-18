import { ActivityTypeEnum, EdgeHandleEnum, type Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../types/edge'

import { ActivityTraversal } from './ActivityTraversal'

/**
 * Utility class for generating edges between workflow activities.
 *
 * This module handles all edge creation patterns including:
 * - Sequential edges between activities
 * - Branch edges for conditions (true/false)
 * - Parallel branch edges
 * - Convergence edges
 * - Loop back edges
 */
export class EdgeGenerator {
  /**
   * Gets the appropriate source handle for an activity based on its type.
   * Loop nodes use 'done' handle, all other nodes use 'source' handle.
   */
  static getSourceHandle(activity: Activity): string {
    return activity.type === ActivityTypeEnum.LOOP ? 'done' : 'source'
  }

  /**
   * Create edge from a branch endpoint to the next activity.
   * Finds the source activity to determine correct handle type.
   */
  static createBranchToNextEdge(
    branch: Activity,
    lastActivityId: string,
    nextId: string,
    edges: EdgeConnection[]
  ): void {
    const sourceActivity = ActivityTraversal.findActivityById(branch, lastActivityId)
    edges.push({
      id: `${lastActivityId}-${nextId}`,
      source: lastActivityId,
      target: nextId,
      sourceHandle: sourceActivity ? this.getSourceHandle(sourceActivity) : 'source',
      targetHandle: 'target',
    })
  }

  /**
   * Create edges for partial convergence (only some branches converge).
   * Only creates edges for branches that are in the convergence set.
   */
  static createPartialConvergenceEdges(
    branches: Activity[],
    convergeBranchSet: Set<string>,
    nextId: string,
    edges: EdgeConnection[]
  ): void {
    for (const branch of branches) {
      const lastActivityIds = ActivityTraversal.getAllLastActivityIds(branch)

      for (const lastActivityId of lastActivityIds) {
        if (convergeBranchSet.has(lastActivityId)) {
          this.createBranchToNextEdge(branch, lastActivityId, nextId, edges)
        }
      }
    }
  }

  /**
   * Create edges for full convergence (all branches converge).
   * Creates edges from the last activity of each branch to the next activity.
   */
  static createFullConvergenceEdges(branches: Activity[], nextId: string, edges: EdgeConnection[]): void {
    for (const branch of branches) {
      const lastActivityId = ActivityTraversal.getLastActivityId(branch)
      this.createBranchToNextEdge(branch, lastActivityId, nextId, edges)
    }
  }

  /**
   * Create edges from parallel branches to next activity.
   * Handles partial convergence if next is a converge node.
   */
  static createParallelToNextEdges(
    parallel: Extract<Activity, { type: 'parallel' }>,
    next: Activity,
    edges: EdgeConnection[]
  ): void {
    const branches = parallel.branches || []
    const nextId = ActivityTraversal.getActivityId(next)

    if (next.type === ActivityTypeEnum.CONVERGE) {
      const convergeBranches = next.converge?.branches || []
      const convergeBranchSet = new Set(convergeBranches)
      this.createPartialConvergenceEdges(branches, convergeBranchSet, nextId, edges)
    } else {
      this.createFullConvergenceEdges(branches, nextId, edges)
    }
  }

  /**
   * Create edges from a condition to its branch activities.
   * Handles both single activities and parallel branches.
   *
   * @param conditionId - ID of the condition node
   * @param branchActivities - Activities in the branch (then or else)
   * @param handle - Source handle to use ('true' or 'false')
   * @param edges - Array to push edges into
   */
  static createConditionBranchEdge(
    conditionId: string,
    branchActivities: Activity[],
    handle: 'true' | 'false',
    edges: EdgeConnection[]
  ): void {
    if (branchActivities.length === 0) return

    const firstActivity = branchActivities[0]

    // If first activity is a parallel, create edges to all branches
    if (firstActivity.type === ActivityTypeEnum.PARALLEL) {
      const branches = firstActivity.branches || []
      for (const branch of branches) {
        edges.push({
          id: `${conditionId}-${handle}-${ActivityTraversal.getFirstActivityId(branch)}`,
          source: conditionId,
          target: ActivityTraversal.getFirstActivityId(branch),
          sourceHandle: handle,
          targetHandle: 'target',
        })
      }
    } else {
      // Regular activity - create single edge
      edges.push({
        id: `${conditionId}-${handle}-${ActivityTraversal.getFirstActivityId(firstActivity)}`,
        source: conditionId,
        target: ActivityTraversal.getFirstActivityId(firstActivity),
        sourceHandle: handle,
        targetHandle: 'target',
      })
    }
  }

  /**
   * Create edges from an approval to its branch activities.
   * Handles both single activities and parallel branches.
   *
   * @param approvalId - ID of the approval node
   * @param branchActivities - Activities in the branch (onApproved or onRejected)
   * @param handle - Source handle to use (EdgeHandleEnum.APPROVED or EdgeHandleEnum.REJECTED)
   * @param edges - Array to push edges into
   */
  static createApprovalBranchEdge(
    approvalId: string,
    branchActivities: Activity[],
    handle: typeof EdgeHandleEnum.APPROVED | typeof EdgeHandleEnum.REJECTED,
    edges: EdgeConnection[]
  ): void {
    if (branchActivities.length === 0) return

    const firstActivity = branchActivities[0]

    // If first activity is a parallel, create edges to all branches
    if (firstActivity.type === ActivityTypeEnum.PARALLEL) {
      const branches = firstActivity.branches || []
      for (const branch of branches) {
        edges.push({
          id: `${approvalId}-${handle}-${ActivityTraversal.getFirstActivityId(branch)}`,
          source: approvalId,
          target: ActivityTraversal.getFirstActivityId(branch),
          sourceHandle: handle,
          targetHandle: 'target',
        })
      }
    } else {
      // Regular activity - create single edge
      edges.push({
        id: `${approvalId}-${handle}-${ActivityTraversal.getFirstActivityId(firstActivity)}`,
        source: approvalId,
        target: ActivityTraversal.getFirstActivityId(firstActivity),
        sourceHandle: handle,
        targetHandle: 'target',
      })
    }
  }

  /**
   * Generate sequential edges between top-level activities.
   * Handles special cases like parallels, conditions, and converge nodes.
   */
  static generateSequentialEdges(activities: Activity[], edges: EdgeConnection[]): void {
    for (let i = 0; i < activities.length - 1; i++) {
      const current = activities[i]
      const next = activities[i + 1]

      // Skip condition nodes (they have explicit branch edges)
      if (current.type === ActivityTypeEnum.CONDITION) continue

      // Skip approval nodes (they have explicit branch edges)
      if (current.type === ActivityTypeEnum.APPROVAL) continue

      // Parallel nodes need special edge handling to their branches
      if (current.type === ActivityTypeEnum.PARALLEL) {
        this.createParallelToNextEdges(current, next, edges)
        continue
      }

      // If next is parallel, create edges from current to each branch
      if (next.type === ActivityTypeEnum.PARALLEL) {
        const branches = next.branches || []
        for (const branch of branches) {
          // Use getFirstActivityId to handle sequence wrappers that will be flattened away
          const targetId = ActivityTraversal.getFirstActivityId(branch)
          edges.push({
            id: `${ActivityTraversal.getActivityId(current)}-${targetId}`,
            source: ActivityTraversal.getActivityId(current),
            target: targetId,
            sourceHandle: this.getSourceHandle(current),
            targetHandle: 'target',
          })
        }
        continue
      }

      // Regular sequential edge
      edges.push({
        id: `${ActivityTraversal.getActivityId(current)}-${ActivityTraversal.getActivityId(next)}`,
        source: ActivityTraversal.getActivityId(current),
        target: ActivityTraversal.getActivityId(next),
        sourceHandle: this.getSourceHandle(current),
        targetHandle: 'target',
      })
    }
  }
}
