import { ActivityTypeEnum, EdgeHandleEnum, type Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../types/edge'

import { ActivityTraversal } from './ActivityTraversal'
import { EdgeGenerator } from './EdgeGenerator'

export type { EdgeConnection }

export interface FlatWorkflow {
  activities: Activity[]
  edges: EdgeConnection[]
}

interface ParallelGroup {
  divergenceSource: string
  divergenceTargets: string[]
  convergeNode?: Activity
  branches: Activity[][]
}

interface NestingContext {
  edges: EdgeConnection[]
  rootActivities: Activity[]
  usedRootActivityIds?: Set<string>
  isRecursiveCall: boolean
}

/**
 * Generate a valid activity ID that matches the API schema pattern: ^[a-zA-Z_][a-zA-Z0-9_]*$
 * Uses a counter to ensure uniqueness within the current session.
 */
let activityIdCounter = 0
function generateActivityId(prefix: string): string {
  activityIdCounter++
  return `${prefix}_${Date.now()}_${activityIdCounter}`
}

/**
 * Symmetric workflow transformation utilities.
 *
 * This module provides a unified interface for converting between:
 * - Flat representation (activities + edges) - used during editing in the builder
 * - Nested representation (activities with then/else/branches) - used by API
 *
 * Key principles:
 * - Builder format: ALL activities are flat, edges define relationships
 * - API format: Parallels and conditions are nested
 * - NO parallel wrappers (parallel_for_* or parallel_auto_*) exist in builder
 * - Parallel containers only created during save (nest operation)
 */
export class WorkflowTransform {
  /**
   * Converts nested workflow structure to flat representation.
   *
   * This operation:
   * 1. Extracts all activities from nested structures (condition.then/else, parallel.branches, etc.)
   * 2. Generates edges representing the nesting relationships
   * 3. Returns completely flat structure suitable for editing
   *
   * All parallel containers are flattened - they don't exist in builder format.
   */
  static flatten(nestedActivities: Activity[]): FlatWorkflow {
    const activities: Activity[] = []
    const edges: EdgeConnection[] = []

    // CRITICAL: First pass - find all converge nodes and determine what should come after them
    // This is complex because the backend might reorder activities (e.g., [C, M, J] instead of [C, J, M])
    // Strategy: A converge node should connect to the first top-level activity that:
    // 1. Appears after it in the array, OR
    // 2. Is NOT referenced by the converge's branches AND not a parent/ancestor of the converge (if converge is last in array)
    for (let i = 0; i < nestedActivities.length; i++) {
      const current = nestedActivities[i]
      if (current.type !== ActivityTypeEnum.CONVERGE) continue

      const convergeBranches = new Set(current.converge?.branches || [])
      const nextActivity = this.findNextActivityAfterConverge(nestedActivities, i, convergeBranches)
      if (!nextActivity) continue

      edges.push({
        id: `${current.id}-${nextActivity.id}`,
        source: current.id,
        target: nextActivity.id,
        sourceHandle: EdgeHandleEnum.SOURCE,
        targetHandle: EdgeHandleEnum.TARGET,
      })
    }

    // Generate sequential edges between top-level activities
    for (let i = 0; i < nestedActivities.length - 1; i++) {
      const current = nestedActivities[i]
      const next = nestedActivities[i + 1]

      // Handle condition nodes followed by converge nodes
      if (current.type === ActivityTypeEnum.CONDITION) {
        // If the next node is a converge, create edges from branch endpoints to converge
        if (next.type === ActivityTypeEnum.CONVERGE) {
          const convergeBranches = next.converge?.branches || []
          const convergeBranchSet = new Set(convergeBranches)
          const conditionActivity = current

          // Get last activity IDs from both then and else branches
          const allBranchEndpoints: string[] = []

          const thenActivities = conditionActivity.then ?? []
          if (thenActivities.length > 0) {
            const thenEndpoints = this.getAllLastActivityIds(thenActivities[thenActivities.length - 1])
            allBranchEndpoints.push(...thenEndpoints)
          }

          const elseActivities = conditionActivity.else ?? []
          if (elseActivities.length > 0) {
            const elseEndpoints = this.getAllLastActivityIds(elseActivities[elseActivities.length - 1])
            allBranchEndpoints.push(...elseEndpoints)
          }

          this.addConditionBranchEndpointEdges({
            allBranchEndpoints,
            convergeBranchSet,
            thenActivities,
            elseActivities,
            convergeActivityId: next.id,
            edges,
          })
        }
        // Skip regular sequential edge for conditions (they have explicit branch edges)
        continue
      }

      // Skip approval nodes - they have explicit branch edges (approved/rejected)
      if (current.type === ActivityTypeEnum.APPROVAL) {
        continue
      }

      // CRITICAL: Parallel containers are REMOVED during flattening
      // When current is parallel, skip (edges FROM parallel branches are handled elsewhere)
      if (current.type === ActivityTypeEnum.PARALLEL) {
        continue
      }

      // When next is parallel, create edges from current to first activity in each branch
      if (next.type === ActivityTypeEnum.PARALLEL) {
        const parallelActivity = next
        const branches = parallelActivity.branches || []
        for (const branch of branches) {
          const firstActivityId = this.getFirstActivityId(branch)
          edges.push({
            id: `${current.id}-${firstActivityId}`,
            source: current.id,
            target: firstActivityId,
            sourceHandle: EdgeGenerator.getSourceHandle(current),
            targetHandle: EdgeHandleEnum.TARGET,
          })
        }
        continue
      }

      // CRITICAL: Skip if current is a converge node (already handled in first pass above)
      if (current.type === ActivityTypeEnum.CONVERGE) {
        continue
      }

      // CRITICAL: If next is a converge node, skip creating sequential edge
      // Edges TO converge nodes come from the activities in its branches array
      // Edges FROM converge nodes are handled in the first pass above
      if (next.type === ActivityTypeEnum.CONVERGE) {
        continue
      }

      // Regular sequential edge
      edges.push({
        id: `${current.id}-${next.id}`,
        source: current.id,
        target: next.id,
        sourceHandle: EdgeGenerator.getSourceHandle(current),
        targetHandle: EdgeHandleEnum.TARGET,
      })
    }

    // Flatten each activity (recursively extract nested activities)
    for (const activity of nestedActivities) {
      this.flattenActivity(activity, activities, edges)
    }

    // Create edges from each converge node's branch sources to the converge node.
    // Parallel containers are removed during flattening (flattenParallel does not keep them),
    // so every converge branch connects directly to its individual source activity.
    for (const activity of activities) {
      if (activity.type !== ActivityTypeEnum.CONVERGE) continue

      for (const branchId of activity.converge?.branches ?? []) {
        this.addBranchToConvergeEdge(branchId, activity, activities, edges)
      }
    }

    return { activities, edges }
  }

  /**
   * Converts flat workflow representation to nested structure.
   *
   * Uses recursive approach:
   * 1. Find ONE outermost parallel group (based on converge nodes)
   * 2. Wrap it in a parallel container, recursively nesting each branch
   * 3. Recurse to find more parallel groups
   *
   * This handles nested parallels correctly because inner parallels are found
   * when recursively processing branches.
   */
  static nest(flatActivities: Activity[], edges: EdgeConnection[]): Activity[] {
    let result = [...flatActivities]

    // 1. Find and wrap ONE parallel group (outermost)
    const group = this.findOutermostParallelGroup(result, edges)

    if (group) {
      // Wrap it recursively (this will nest conditions/loops/parallels within each branch)
      result = this.wrapInParallelRecursive(result, group, edges)
      // Recurse to find more parallels
      return this.nest(result, edges)
    }

    // 2. No more parallels - nest loops (they can contain conditions and approvals)
    result = this.nestLoops(result, edges)

    // Track activities pulled from root level that should be removed from top level
    const usedRootActivityIds = new Set<string>()

    // 3. Nest approvals (they can contain conditions)
    result = this.nestApprovals(result, {
      edges,
      rootActivities: result,
      usedRootActivityIds,
      isRecursiveCall: false,
    })

    // 4. Finally, nest conditions
    result = this.nestConditions(result, {
      edges,
      rootActivities: result,
      usedRootActivityIds,
      isRecursiveCall: false,
    })

    // Remove activities that have been nested inside condition branches (pulled from root)
    result = result.filter((a) => !usedRootActivityIds.has(a.id))

    return result
  }

  /**
   * Helper to get activity ID (handles both Activity objects and simple IDs in nested structures)
   */
  private static getActivityId(activity: Activity | string): string {
    return ActivityTraversal.getActivityId(activity)
  }

  /**
   * Get the ID of the first real activity in a branch.
   * Sequences are flattened away, so we need to drill down to find the first actual activity.
   * Public to allow use in trigger edge generation.
   */
  static getFirstActivityId(activity: Activity): string {
    return ActivityTraversal.getFirstActivityId(activity)
  }

  private static getAllLastActivityIds(activity: Activity): string[] {
    return ActivityTraversal.getAllLastActivityIds(activity)
  }

  private static searchInActivityList(activities: Activity[], targetId: string): Activity | null {
    return ActivityTraversal.searchInActivityList(activities, targetId)
  }

  private static collectAllActivityIds(activity: Activity): string[] {
    return ActivityTraversal.collectAllActivityIds(activity)
  }

  private static findNextActivityAfterConverge(
    nestedActivities: Activity[],
    convergeIndex: number,
    convergeBranches: Set<string>
  ): Activity | null {
    if (convergeIndex < nestedActivities.length - 1) {
      return nestedActivities[convergeIndex + 1]
    }

    const previousActivity = convergeIndex > 0 ? nestedActivities[convergeIndex - 1] : null
    if (previousActivity?.type === ActivityTypeEnum.PARALLEL) {
      return null
    }

    for (let candidateIndex = 0; candidateIndex < convergeIndex; candidateIndex++) {
      const candidate = nestedActivities[candidateIndex]
      if (this.isStructuralActivity(candidate)) continue
      if (convergeBranches.has(candidate.id)) continue
      if (this.candidateFeedsIntoConverge(nestedActivities, candidateIndex, convergeBranches)) continue
      return candidate
    }

    return null
  }

  private static isStructuralActivity(activity: Activity): boolean {
    return (
      activity.type === ActivityTypeEnum.CONDITION ||
      activity.type === ActivityTypeEnum.LOOP ||
      activity.type === ActivityTypeEnum.PARALLEL
    )
  }

  private static candidateFeedsIntoConverge(
    nestedActivities: Activity[],
    candidateIndex: number,
    convergeBranches: Set<string>
  ): boolean {
    for (const branchId of convergeBranches) {
      if (this.branchAppearsAfterCandidate(nestedActivities, candidateIndex, branchId)) {
        return true
      }

      if (this.branchIsNestedInsideOrAfterCandidate(nestedActivities, candidateIndex, branchId)) {
        return true
      }
    }

    return false
  }

  private static branchAppearsAfterCandidate(
    nestedActivities: Activity[],
    candidateIndex: number,
    branchId: string
  ): boolean {
    const branchIndex = nestedActivities.findIndex((activity) => activity.id === branchId)
    return branchIndex !== -1 && branchIndex > candidateIndex
  }

  private static branchIsNestedInsideOrAfterCandidate(
    nestedActivities: Activity[],
    candidateIndex: number,
    branchId: string
  ): boolean {
    for (let activityIndex = candidateIndex; activityIndex < nestedActivities.length; activityIndex++) {
      const nestedIds = this.collectAllActivityIds(nestedActivities[activityIndex])
      if (nestedIds.includes(branchId)) {
        return true
      }
    }

    return false
  }

  private static collectParallelBranchIds(parallelActivity: Extract<Activity, { type: 'parallel' }>): Set<string> {
    const branchIds = new Set<string>()

    for (const branch of parallelActivity.branches || []) {
      branchIds.add(branch.id)
      const nestedIds = this.collectAllActivityIds(branch)
      for (const id of nestedIds) {
        branchIds.add(id)
      }
    }

    return branchIds
  }

  private static addBranchToConvergeEdge(
    branchId: string,
    convergeActivity: Extract<Activity, { type: 'converge' }>,
    activities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const edgeExists = edges.some((edge) => edge.source === branchId && edge.target === convergeActivity.id)
    if (edgeExists) {
      return
    }

    const branchActivity = activities.find((activity) => activity.id === branchId)
    if (!branchActivity) {
      return
    }

    edges.push({
      id: `${branchId}-${convergeActivity.id}`,
      source: branchId,
      target: convergeActivity.id,
      sourceHandle: EdgeGenerator.getSourceHandle(branchActivity),
      targetHandle: EdgeHandleEnum.TARGET,
    })
  }

  private static addConditionBranchEndpointEdges({
    allBranchEndpoints,
    convergeBranchSet,
    thenActivities,
    elseActivities,
    convergeActivityId,
    edges,
  }: {
    allBranchEndpoints: string[]
    convergeBranchSet: Set<string>
    thenActivities: Activity[]
    elseActivities: Activity[]
    convergeActivityId: string
    edges: EdgeConnection[]
  }): void {
    for (const endpointId of allBranchEndpoints) {
      if (!convergeBranchSet.has(endpointId)) continue

      const sourceActivity =
        this.searchInActivityList(thenActivities, endpointId) ?? this.searchInActivityList(elseActivities, endpointId)

      edges.push({
        id: `${endpointId}-${convergeActivityId}`,
        source: endpointId,
        target: convergeActivityId,
        sourceHandle: sourceActivity ? EdgeGenerator.getSourceHandle(sourceActivity) : EdgeHandleEnum.SOURCE,
        targetHandle: EdgeHandleEnum.TARGET,
      })
    }
  }

  /**
   * Recursively flatten an activity and its nested children
   */
  private static flattenActivity(activity: Activity, flatActivities: Activity[], edges: EdgeConnection[]): void {
    switch (activity.type) {
      case ActivityTypeEnum.CONDITION:
        this.flattenCondition(activity, flatActivities, edges)
        break
      case ActivityTypeEnum.APPROVAL:
        this.flattenApproval(activity, flatActivities, edges)
        break
      case ActivityTypeEnum.PARALLEL:
        this.flattenParallel(activity, flatActivities, edges)
        break
      case ActivityTypeEnum.SEQUENCE:
        this.flattenSequence(activity, flatActivities, edges)
        break
      case ActivityTypeEnum.LOOP:
        this.flattenLoop(activity, flatActivities, edges)
        break
      case ActivityTypeEnum.TASK:
      case ActivityTypeEnum.CONVERGE:
        flatActivities.push(activity)
        break
    }
  }

  /**
   * Flatten a condition node
   */
  private static flattenCondition(
    activity: Extract<Activity, { type: 'condition' }>,
    flatActivities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const thenActivities = activity.then ?? []
    const elseActivities = activity.else ?? []

    // Add condition with empty branches
    flatActivities.push({
      ...activity,
      then: [],
      else: [],
    })

    // Create edges to branches using EdgeGenerator (eliminates duplication)
    EdgeGenerator.createConditionBranchEdge(activity.id, thenActivities, 'true', edges)
    EdgeGenerator.createConditionBranchEdge(activity.id, elseActivities, 'false', edges)

    // Generate sequential edges within branches
    this.generateSequentialEdges(thenActivities, edges)
    this.generateSequentialEdges(elseActivities, edges)

    // Recursively process nested activities
    for (const nested of [...thenActivities, ...elseActivities]) {
      this.flattenActivity(nested, flatActivities, edges)
    }
  }

  /**
   * Flatten a parallel node - extract all nested activities, remove container
   */
  private static flattenParallel(
    activity: Extract<Activity, { type: 'parallel' }>,
    flatActivities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const branches = activity.branches || []

    // CRITICAL: Do NOT keep the parallel container - it's removed during flattening
    // Recursively flatten each branch's contents and add to main flatActivities array
    for (const branch of branches) {
      const branchFlat: Activity[] = []
      const branchEdges: EdgeConnection[] = []
      this.flattenActivity(branch, branchFlat, branchEdges)

      // Add all flattened activities from this branch to the main array
      flatActivities.push(...branchFlat)

      // Add branch edges to the main edges array
      edges.push(...branchEdges)
    }

    // NOTE: Parallel container is NOT added to flatActivities
    // It will be recreated during nest() operation based on edges
  }

  /**
   * Flatten a sequence node
   */
  private static flattenSequence(
    activity: Extract<Activity, { type: 'sequence' }>,
    flatActivities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const steps = activity.steps || []

    // Don't add sequence wrapper - just process steps
    // Generate edges between steps
    this.generateSequentialEdges(steps, edges)

    // Recursively process steps
    for (const step of steps) {
      this.flattenActivity(step, flatActivities, edges)
    }
  }

  /**
   * Flatten a loop node
   */
  private static flattenLoop(
    activity: Extract<Activity, { type: 'loop' }>,
    flatActivities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const doActivities = activity.loop.do || []

    // Add loop node with empty do array
    flatActivities.push({
      ...activity,
      loop: {
        ...activity.loop,
        do: [],
      },
    } as Extract<Activity, { type: 'loop' }>)

    // Generate edge from loop's 'loop' handle to first activity
    if (doActivities.length > 0) {
      const firstDo = doActivities[0]
      edges.push({
        id: `${activity.id}-loop-${this.getActivityId(firstDo)}`,
        source: activity.id,
        target: this.getActivityId(firstDo),
        sourceHandle: EdgeHandleEnum.LOOP,
        targetHandle: EdgeHandleEnum.TARGET,
      })
    }

    // Generate sequential edges within loop body
    this.generateSequentialEdges(doActivities, edges)

    // Edge from last activity/activities back to loop (back-edge uses 'end' handle)
    // CRITICAL: Use getAllLastActivityIds to handle conditions/parallels correctly
    if (doActivities.length > 0) {
      const lastDo = doActivities[doActivities.length - 1]
      const lastActivityIds = this.getAllLastActivityIds(lastDo)

      for (const lastActivityId of lastActivityIds) {
        // Search for the source activity in the nested structure (before flattening)
        const sourceActivity = this.searchInActivityList(doActivities, lastActivityId)
        const sourceHandle = sourceActivity ? EdgeGenerator.getSourceHandle(sourceActivity) : EdgeHandleEnum.SOURCE

        edges.push({
          id: `${lastActivityId}-${activity.id}`,
          source: lastActivityId,
          target: activity.id,
          sourceHandle,
          targetHandle: EdgeHandleEnum.END,
        })
      }
    }

    // Recursively process loop body
    for (const nested of doActivities) {
      this.flattenActivity(nested, flatActivities, edges)
    }
  }

  /**
   * Flatten an approval node
   */
  private static flattenApproval(
    activity: Extract<Activity, { type: 'approval' }>,
    flatActivities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const onApprovedActivities = activity.onApproved ?? []
    const onRejectedActivities = activity.onRejected ?? []

    // Add approval with empty branches
    flatActivities.push({
      ...activity,
      onApproved: [],
      onRejected: [],
    })

    // Create edges to branches using EdgeGenerator
    EdgeGenerator.createApprovalBranchEdge(activity.id, onApprovedActivities, EdgeHandleEnum.APPROVED, edges)
    EdgeGenerator.createApprovalBranchEdge(activity.id, onRejectedActivities, EdgeHandleEnum.REJECTED, edges)

    // Generate sequential edges within branches
    this.generateSequentialEdges(onApprovedActivities, edges)
    this.generateSequentialEdges(onRejectedActivities, edges)

    // Recursively process nested activities
    for (const nested of [...onApprovedActivities, ...onRejectedActivities]) {
      this.flattenActivity(nested, flatActivities, edges)
    }
  }

  /**
   * Generate sequential edges between top-level activities
   */
  private static generateSequentialEdges(activities: Activity[], edges: EdgeConnection[]): void {
    EdgeGenerator.generateSequentialEdges(activities, edges)
  }

  /**
   * Nest loop nodes based on edges
   */
  private static nestLoops(flatActivities: Activity[], edges: EdgeConnection[]): Activity[] {
    let result = [...flatActivities]
    const loopActivities = result.filter((a) => a.type === ActivityTypeEnum.LOOP)

    for (const loopActivity of loopActivities) {
      // Skip if already moved into another loop's body
      if (!result.some((a) => a.id === loopActivity.id)) {
        continue
      }

      // Find edge from loop handle (sourceHandle === 'loop')
      const loopEdges = edges.filter((e) => e.source === loopActivity.id && e.sourceHandle === EdgeHandleEnum.LOOP)
      const loopStartIds = loopEdges.map((e) => e.target)

      if (loopStartIds.length === 0) {
        // Loop has no body - leave it with empty do array
        continue
      }

      // Find all activities in the loop body
      // Loop body activities are those reachable from the loop handle that eventually
      // connect back to the loop node (or are isolated within the loop)
      const doActivities = this.findLoopBodyActivities(loopActivity.id, loopStartIds, edges, result)

      // Remove loop body activities from top level
      const loopBodyIds = new Set(doActivities.map((a) => a.id))
      result = result.filter((a) => !loopBodyIds.has(a.id))

      // Recursively nest the loop body (loops, conditions, parallels)
      // Get edges within the loop body
      const loopBodyIdSet = new Set(doActivities.map((a) => a.id))
      const bodyEdges = edges.filter((e) => loopBodyIdSet.has(e.source) && loopBodyIdSet.has(e.target))

      // Recursively nest everything within the loop body
      const processedDo = this.nest(doActivities, bodyEdges)

      // Update loop with nested body
      const loopIndex = result.findIndex((a) => a.id === loopActivity.id)
      if (loopIndex !== -1) {
        result[loopIndex] = {
          ...loopActivity,
          loop: {
            ...loopActivity.loop,
            do: processedDo,
          },
        } as Extract<Activity, { type: 'loop' }>
      }
    }

    return result
  }

  /**
   * Find all activities in a loop body
   */
  private static findLoopBodyActivities(
    loopId: string,
    startIds: string[],
    edges: EdgeConnection[],
    allActivities: Activity[]
  ): Activity[] {
    const result: Activity[] = []
    const visited = new Set<string>()

    for (const startId of startIds) {
      const bodyActivities = this.collectLoopBodyActivities(startId, loopId, edges, allActivities, visited)
      result.push(...bodyActivities)
    }

    return result
  }

  /**
   * Collect activities in loop body starting from a given ID
   */
  private static collectLoopBodyActivities(
    startId: string,
    loopId: string,
    edges: EdgeConnection[],
    allActivities: Activity[],
    visited: Set<string>
  ): Activity[] {
    if (visited.has(startId)) return []

    const activity = allActivities.find((a) => a.id === startId)
    if (!activity) return []

    visited.add(startId)
    const result = [activity]

    // Follow outgoing edges, but stop at loop node (back edge)
    const outgoing = edges.filter((e) => e.source === startId && e.target !== loopId)

    for (const edge of outgoing) {
      const nextActivities = this.collectLoopBodyActivities(edge.target, loopId, edges, allActivities, visited)
      result.push(...nextActivities)
    }

    return result
  }

  /**
   * Nest approval nodes based on edges
   */
  private static nestApprovals(flatActivities: Activity[], context: NestingContext): Activity[] {
    const { edges, rootActivities, usedRootActivityIds } = context
    let result = [...flatActivities]
    const approvalActivities = result.filter((a) => a.type === ActivityTypeEnum.APPROVAL)

    for (const approvalActivity of approvalActivities) {
      // Skip if already moved into another node's branches
      if (!result.some((a) => a.id === approvalActivity.id)) {
        continue
      }

      // Find edges from approved/rejected handles
      const approvedEdges = edges.filter(
        (e) => e.source === approvalActivity.id && e.sourceHandle === EdgeHandleEnum.APPROVED
      )
      const rejectedEdges = edges.filter(
        (e) => e.source === approvalActivity.id && e.sourceHandle === EdgeHandleEnum.REJECTED
      )

      const approvedStartIds = approvedEdges.map((e) => e.target)
      const rejectedStartIds = rejectedEdges.map((e) => e.target)

      // Find all activities belonging to each branch
      // CRITICAL: Use flatActivities (not result) to search for activities, as result gets modified during loop
      const onApprovedActivities = this.findBranchActivities(approvedStartIds, flatActivities, context)
      const onRejectedActivities = this.findBranchActivities(rejectedStartIds, flatActivities, context)

      // Remove branch activities from top level
      const allBranchActivityIds = new Set([
        ...onApprovedActivities.map((a) => a.id),
        ...onRejectedActivities.map((a) => a.id),
      ])
      result = result.filter((a) => !allBranchActivityIds.has(a.id))

      // Recursively process nested nodes
      // First nest any approvals, then nest conditions (approvals can contain conditions)
      const recursiveCtx: NestingContext = {
        edges,
        rootActivities,
        usedRootActivityIds,
        isRecursiveCall: true,
      }
      let processedApproved = this.nestApprovals(onApprovedActivities, recursiveCtx)
      processedApproved = this.nestConditions(processedApproved, recursiveCtx)

      let processedRejected = this.nestApprovals(onRejectedActivities, recursiveCtx)
      processedRejected = this.nestConditions(processedRejected, recursiveCtx)

      // Update approval with nested branches
      const approvalIndex = result.findIndex((a) => a.id === approvalActivity.id)
      if (approvalIndex !== -1) {
        result[approvalIndex] = {
          ...approvalActivity,
          onApproved: processedApproved,
          onRejected: processedRejected.length > 0 ? processedRejected : undefined,
        } as Extract<Activity, { type: 'approval' }>
      }
    }

    return result
  }

  /**
   * Nest condition nodes based on edges
   */
  private static nestConditions(
    flatActivities: Activity[],
    context: NestingContext,
    processedConditionIds: Set<string> = new Set()
  ): Activity[] {
    const { edges, rootActivities, usedRootActivityIds } = context
    let result = [...flatActivities]
    const conditionActivities = result.filter((a) => a.type === ActivityTypeEnum.CONDITION)

    // CRITICAL: Process conditions in the order they should be nested
    // Conditions that are NOT reached via branch edges from other conditions should be processed first
    // This ensures outer conditions are processed before their nested inner conditions
    const conditionIds = new Set(conditionActivities.map((a) => a.id))
    const nestedConditionIds = new Set<string>()

    // Find conditions that are reached via branch edges from other conditions
    for (const edge of edges) {
      if (
        conditionIds.has(edge.source) &&
        (edge.sourceHandle === 'true' || edge.sourceHandle === 'false') &&
        conditionIds.has(edge.target)
      ) {
        nestedConditionIds.add(edge.target)
      }
    }

    // Sort conditions: top-level first, then nested
    const sortedConditions = [
      ...conditionActivities.filter((a) => !nestedConditionIds.has(a.id)),
      ...conditionActivities.filter((a) => nestedConditionIds.has(a.id)),
    ]

    for (const conditionActivity of sortedConditions) {
      // Skip if already processed in a parent call
      if (processedConditionIds.has(conditionActivity.id)) {
        continue
      }

      // Skip if already moved into another condition's branches
      if (!result.some((a) => a.id === conditionActivity.id)) {
        continue
      }

      // Mark this condition as processed
      processedConditionIds.add(conditionActivity.id)

      // Find edges from true/false handles
      const trueEdges = edges.filter((e) => e.source === conditionActivity.id && e.sourceHandle === EdgeHandleEnum.TRUE)
      const falseEdges = edges.filter(
        (e) => e.source === conditionActivity.id && e.sourceHandle === EdgeHandleEnum.FALSE
      )

      const trueStartIds = trueEdges.map((e) => e.target)
      const falseStartIds = falseEdges.map((e) => e.target)

      // Find all activities belonging to each branch
      // CRITICAL: Use flatActivities (not result) to search for activities, as result gets modified during loop
      // Use rootActivities to find parallel containers that might be at top level
      // Pass isRecursiveCall flag to track whether we're in a recursive call
      const thenActivities = this.findBranchActivities(trueStartIds, flatActivities, context)
      const elseActivities = this.findBranchActivities(falseStartIds, flatActivities, context)

      // Remove branch activities from top level
      const allBranchActivityIds = new Set([...thenActivities.map((a) => a.id), ...elseActivities.map((a) => a.id)])
      result = result.filter((a) => !allBranchActivityIds.has(a.id))

      // Recursively process nested conditions (pass rootActivities and usedRootActivityIds through)
      // Mark recursive calls as recursive (true)
      // CRITICAL: Use a NEW processedConditionIds set for each branch to allow conditions to be
      // processed again if they appear in different branches (e.g., condition in approval's onApproved)
      const recursiveContext: NestingContext = {
        edges,
        rootActivities,
        usedRootActivityIds,
        isRecursiveCall: true,
      }
      const processedThen = this.nestConditions(thenActivities, recursiveContext, new Set<string>())
      const processedElse = this.nestConditions(elseActivities, recursiveContext, new Set<string>())

      // Update condition with nested branches
      const conditionIndex = result.findIndex((a) => a.id === conditionActivity.id)
      if (conditionIndex !== -1) {
        result[conditionIndex] = {
          ...conditionActivity,
          then: processedThen,
          else: processedElse.length > 0 ? processedElse : undefined,
        } as Extract<Activity, { type: 'condition' }>
      }
    }

    return result
  }

  /**
   * Find parallel container that contains the given startIds in its branches
   */
  private static findParallelContainerForStartIds(
    startIds: string[],
    rootActivities: Activity[]
  ): Activity | undefined {
    return rootActivities.find((a) => {
      if (a.type !== ActivityTypeEnum.PARALLEL) return false
      const branches = a.branches || []

      return startIds.every((startId) => {
        return branches.some((branch) => {
          const branchActivityIds = this.collectAllActivityIds(branch)
          return branchActivityIds.includes(startId)
        })
      })
    })
  }

  /**
   * Collect all activity IDs from parallel container branches
   */
  private static collectBranchActivityIds(parallelContainer: Activity): Set<string> {
    const branches = (parallelContainer as Extract<Activity, { type: 'parallel' }>).branches || []
    const branchActivityIds = new Set<string>()
    for (const branch of branches) {
      const ids = this.collectAllActivityIds(branch)
      for (const id of ids) {
        branchActivityIds.add(id)
      }
    }
    return branchActivityIds
  }

  /**
   * Filter activities to exclude converge nodes when in recursive call
   */
  private static filterConvergeNodesIfRecursive(activities: Activity[], isRecursiveCall: boolean): Activity[] {
    if (!isRecursiveCall) {
      return activities
    }

    const convergeIndex = activities.findIndex((a) => a.type === ActivityTypeEnum.CONVERGE)
    if (convergeIndex !== -1) {
      return activities.slice(0, convergeIndex)
    }

    return activities
  }

  /**
   * Collect activities that follow a parallel container
   */
  private static collectActivitiesAfterParallel(
    parallelContainer: Activity,
    allActivities: Activity[],
    context: NestingContext
  ): Activity[] {
    const { edges, rootActivities, usedRootActivityIds, isRecursiveCall } = context
    const result: Activity[] = []
    const visited = new Set<string>()

    const branchActivityIds = this.collectBranchActivityIds(parallelContainer)
    const outgoingEdges = edges.filter((e) => branchActivityIds.has(e.source) && !branchActivityIds.has(e.target))

    // Mark all branch activities as visited to prevent converge node duplication
    for (const id of branchActivityIds) {
      visited.add(id)
    }

    for (const edge of outgoingEdges) {
      const targetInCurrentScope = allActivities.some((a) => a.id === edge.target)
      const searchList = targetInCurrentScope ? allActivities : rootActivities

      const afterActivities = this.collectSequentialActivities(edge.target, edges, searchList, visited)
      const activitiesToAdd = this.filterConvergeNodesIfRecursive(afterActivities, isRecursiveCall)

      // Track activities collected from rootActivities in recursive calls
      if (!targetInCurrentScope && isRecursiveCall && usedRootActivityIds) {
        activitiesToAdd.forEach((a) => usedRootActivityIds.add(a.id))
      }

      result.push(...activitiesToAdd)
    }

    return result
  }

  /**
   * Handle case where startIds are wrapped in a parallel container
   */
  private static handleParallelContainerCase(
    startIds: string[],
    allActivities: Activity[],
    context: NestingContext
  ): Activity[] | null {
    const { rootActivities, usedRootActivityIds } = context
    const foundStartIds = startIds.filter((id) => allActivities.some((a) => a.id === id))

    // If multiple startIds but none exist in allActivities, they may be wrapped in a parallel container
    if (startIds.length < 2 || foundStartIds.length > 0) {
      return null
    }

    const parallelContainer = this.findParallelContainerForStartIds(startIds, rootActivities)
    if (!parallelContainer) {
      return null
    }

    const result: Activity[] = [parallelContainer]

    // Track that this parallel was pulled from rootActivities
    if (usedRootActivityIds && parallelContainer.id) {
      usedRootActivityIds.add(parallelContainer.id)
    }

    // Collect activities that follow the parallel container
    const afterActivities = this.collectActivitiesAfterParallel(parallelContainer, allActivities, context)

    result.push(...afterActivities)
    return result
  }

  /**
   * Find all activities in a branch starting from the given IDs.
   *
   * Special handling: If multiple startIds exist but none of them are found in allActivities,
   * it likely means they've been wrapped in a parallel container. In this case, find and
   * return that parallel container instead.
   *
   * @param startIds - Activity IDs to start collecting from
   * @param allActivities - Activities in the current scope (may be nested)
   * @param context - Nesting context (edges, rootActivities, usedRootActivityIds, isRecursiveCall)
   */
  private static findBranchActivities(
    startIds: string[],
    allActivities: Activity[],
    context: NestingContext
  ): Activity[] {
    const { edges } = context

    // Try to handle parallel container case
    const parallelResult = this.handleParallelContainerCase(startIds, allActivities, context)

    if (parallelResult) {
      return parallelResult
    }

    // Normal case: collect activities from each startId
    const result: Activity[] = []
    const visited = new Set<string>()

    for (const startId of startIds) {
      const branchActivities = this.collectSequentialActivities(startId, edges, allActivities, visited)
      result.push(...branchActivities)
    }

    return result
  }

  /**
   * Collect activities sequentially from a starting point
   */
  private static collectSequentialActivities(
    startId: string,
    edges: EdgeConnection[],
    allActivities: Activity[],
    visited: Set<string>
  ): Activity[] {
    if (visited.has(startId)) {
      return []
    }

    const activity = allActivities.find((a) => a.id === startId)
    if (!activity) {
      return []
    }

    // CRITICAL: Converge node collection logic
    // Don't collect converge nodes that have incoming edges from OUTSIDE the current traversal scope
    // This prevents duplicates when collecting individual parallel branches
    if (
      activity.type === ActivityTypeEnum.CONVERGE &&
      this.hasOutOfScopeIncomingEdges(startId, edges, allActivities, visited)
    ) {
      // This converge node has incoming edges from activities truly outside our scope
      // Don't collect it here
      return []
    }

    visited.add(startId)
    const result = [activity]

    // CRITICAL: For condition/approval nodes, collect their branch contents but don't follow sequential edges
    // The branch contents need to be included so they can be recursively nested
    if (activity.type === ActivityTypeEnum.CONDITION || activity.type === ActivityTypeEnum.APPROVAL) {
      // Find and collect all activities in this node's branches
      const branchEdges = edges.filter(
        (e) =>
          e.source === startId &&
          (e.sourceHandle === EdgeHandleEnum.TRUE ||
            e.sourceHandle === EdgeHandleEnum.FALSE ||
            e.sourceHandle === EdgeHandleEnum.APPROVED ||
            e.sourceHandle === EdgeHandleEnum.REJECTED)
      )

      for (const branchEdge of branchEdges) {
        const branchActivities = this.collectSequentialActivities(branchEdge.target, edges, allActivities, visited)
        result.push(...branchActivities)
      }

      // Don't follow sequential edges from condition/approval nodes
      return result
    }

    // CRITICAL: For parallel containers, collect activities that follow the parallel
    // For example: cond2 → parallel(A,B) → J means J should be in cond2.then
    if (activity.type === ActivityTypeEnum.PARALLEL) {
      const branchActivityIds = this.collectParallelBranchIds(activity)

      // Mark all branch activities as visited to prevent collecting them again
      for (const id of branchActivityIds) {
        visited.add(id)
      }

      // Find edges FROM branch activities TO activities outside the parallel
      const outgoingFromBranches = edges.filter(
        (e) => branchActivityIds.has(e.source) && !branchActivityIds.has(e.target)
      )

      // Collect activities that follow the parallel
      for (const edge of outgoingFromBranches) {
        const nextActivities = this.collectSequentialActivities(edge.target, edges, allActivities, visited)
        result.push(...nextActivities)
      }

      return result
    }

    // Follow outgoing edges
    const outgoing = edges.filter((e) => e.source === startId)

    for (const edge of outgoing) {
      // Check if target exists in allActivities
      const targetExists = allActivities.some((a) => a.id === edge.target)

      if (!targetExists) {
        // Target doesn't exist - it might be wrapped in a parallel container
        // Check if there's a parallel at the same level that contains this target
        const parallelContainer = allActivities.find((a): a is Extract<Activity, { type: 'parallel' }> => {
          if (a.type !== ActivityTypeEnum.PARALLEL) return false
          if (visited.has(a.id)) return false // Already collected

          return a.branches.some((branch) => {
            const branchIds = this.collectAllActivityIds(branch)
            return branchIds.includes(edge.target)
          })
        })

        if (parallelContainer) {
          this.collectParallelContainerActivities({
            edge,
            parallelContainer,
            edges,
            allActivities,
            visited,
            result,
          })
          continue
        }
      }

      const nextActivities = this.collectSequentialActivities(edge.target, edges, allActivities, visited)
      result.push(...nextActivities)
    }

    return result
  }

  private static hasOutOfScopeIncomingEdges(
    activityId: string,
    edges: EdgeConnection[],
    allActivities: Activity[],
    visited: Set<string>
  ): boolean {
    const incomingEdges = edges.filter((edge) => edge.target === activityId)

    return incomingEdges.some((edge) => this.isOutOfScopeIncomingEdge(edge, edges, allActivities, visited))
  }

  private static isOutOfScopeIncomingEdge(
    incomingEdge: EdgeConnection,
    edges: EdgeConnection[],
    allActivities: Activity[],
    visited: Set<string>
  ): boolean {
    const sourceExists = allActivities.some((activity) => activity.id === incomingEdge.source)
    if (!sourceExists) {
      return false
    }

    if (visited.has(incomingEdge.source)) {
      return false
    }

    for (const visitedId of visited) {
      const outgoing = edges.filter((edge) => edge.source === visitedId)
      if (outgoing.some((edge) => edge.target === incomingEdge.source)) {
        return false
      }
    }

    return true
  }

  private static collectParallelContainerActivities({
    edge,
    parallelContainer,
    edges,
    allActivities,
    visited,
    result,
  }: {
    edge: EdgeConnection
    parallelContainer: Extract<Activity, { type: 'parallel' }>
    edges: EdgeConnection[]
    allActivities: Activity[]
    visited: Set<string>
    result: Activity[]
  }): void {
    visited.add(parallelContainer.id)
    result.push(parallelContainer)

    const branchIds = this.collectAllActivityIds(parallelContainer)
    for (const id of branchIds) {
      visited.add(id)
    }

    if (this.isStructuralHandle(edge.sourceHandle)) {
      return
    }

    const outgoingFromParallel = edges.filter(
      (parallelEdge) => branchIds.includes(parallelEdge.source) && !branchIds.includes(parallelEdge.target)
    )

    for (const parallelEdge of outgoingFromParallel) {
      if (visited.has(parallelEdge.target)) continue
      if (this.shouldSkipParallelTarget(parallelEdge.target, branchIds, edges, allActivities, visited)) continue

      const afterParallel = this.collectSequentialActivities(parallelEdge.target, edges, allActivities, visited)
      result.push(...afterParallel)
    }
  }

  private static isStructuralHandle(sourceHandle?: string | null): boolean {
    return (
      sourceHandle === EdgeHandleEnum.TRUE ||
      sourceHandle === EdgeHandleEnum.FALSE ||
      sourceHandle === EdgeHandleEnum.LOOP
    )
  }

  private static shouldSkipParallelTarget(
    targetId: string,
    branchIds: string[],
    edges: EdgeConnection[],
    allActivities: Activity[],
    visited: Set<string>
  ): boolean {
    const targetActivity = allActivities.find((activity) => activity.id === targetId)
    if (targetActivity?.type !== ActivityTypeEnum.CONVERGE) {
      return false
    }

    const incomingToConverge = edges.filter((edge) => edge.target === targetId)
    return incomingToConverge.some((edge) => this.isExternalConvergeInput(edge, branchIds, allActivities, visited))
  }

  private static isExternalConvergeInput(
    edge: EdgeConnection,
    branchIds: string[],
    allActivities: Activity[],
    visited: Set<string>
  ): boolean {
    if (branchIds.includes(edge.source)) {
      return false
    }

    if (visited.has(edge.source)) {
      return false
    }

    return allActivities.some((activity) => activity.id === edge.source)
  }

  /**
   * Find parallel group from converge nodes
   */
  private static findParallelFromConverge(activities: Activity[], edges: EdgeConnection[]): ParallelGroup | null {
    const convergeNodes = activities.filter((a) => a.type === ActivityTypeEnum.CONVERGE)
    const allActivityIds = new Set(activities.map((a) => a.id))

    for (const converge of convergeNodes) {
      const branchEndIds = converge.converge?.branches || []

      if (branchEndIds.length < 2) continue

      // Skip if converge references wrapped activities (avoids infinite recursion)
      const missingBranches = branchEndIds.filter((id) => !allActivityIds.has(id))
      if (missingBranches.length > 0) continue

      const divergenceInfo = this.findDivergencePoint(branchEndIds, edges, activities)
      if (!divergenceInfo) continue

      // CRITICAL: Skip if divergence uses structural handles (true/false/loop)
      // These should be handled by condition/loop nesting, not parallel nesting
      const divergenceEdges = edges.filter((e) => e.source === divergenceInfo.divergenceSource)
      const usesStructuralHandles = divergenceEdges.some(
        (e) =>
          e.sourceHandle === EdgeHandleEnum.TRUE ||
          e.sourceHandle === EdgeHandleEnum.FALSE ||
          e.sourceHandle === EdgeHandleEnum.LOOP
      )
      if (usesStructuralHandles) continue

      // Include ALL branches from same handle (for partial convergence)
      const allOutgoingEdges = edges.filter((e) => e.source === divergenceInfo.divergenceSource)
      const convergingEdges = allOutgoingEdges.filter((e) => divergenceInfo.divergenceTargets.includes(e.target))
      const sourceHandle = convergingEdges[0]?.sourceHandle
      const sameHandleEdges = allOutgoingEdges.filter((e) => e.sourceHandle === sourceHandle)
      const allBranchTargets = sameHandleEdges.map((e) => e.target)

      const finalTargets =
        allBranchTargets.length > divergenceInfo.divergenceTargets.length
          ? allBranchTargets
          : divergenceInfo.divergenceTargets

      // Collect branch activities with partial convergence handling
      const convergeBranchSet = new Set(converge.converge?.branches || [])
      const branches = finalTargets.map((targetId) => {
        const branchActivities = this.collectBranchActivities(targetId, converge.id, edges, activities)
        const branchActivityIds = new Set(branchActivities.map((a) => a.id))
        const reachesConvergePoint = Array.from(convergeBranchSet).some((branchId) => branchActivityIds.has(branchId))

        if (!reachesConvergePoint) {
          const allDownstream = this.collectBranchActivitiesNoStop(targetId, edges, activities)
          return allDownstream.filter((a) => a.id !== converge.id)
        }
        return branchActivities
      })

      return {
        divergenceSource: divergenceInfo.divergenceSource,
        divergenceTargets: finalTargets,
        convergeNode: converge,
        branches,
      }
    }
    return null
  }

  /**
   * Find external sources (edges from activities not in the current set)
   */
  private static findExternalSources(activities: Activity[], edges: EdgeConnection[]): Set<string> {
    const activityIds = new Set(activities.map((a) => a.id))
    const externalSources = new Set<string>()

    for (const edge of edges) {
      if (!activityIds.has(edge.source)) {
        externalSources.add(edge.source)
      }
    }

    return externalSources
  }

  /**
   * Find a partial convergence node for the given divergence targets
   */
  private static findPartialConvergeNode(
    divergenceTargets: string[],
    edges: EdgeConnection[],
    activities: Activity[]
  ): { convergencePoint: string; convergeNode: Activity } | null {
    const convergeNodes = activities.filter((a) => a.type === ActivityTypeEnum.CONVERGE)

    for (const node of convergeNodes) {
      const convergeBranches = node.converge?.branches || []

      // Collect all downstream activity IDs from divergence targets
      const downstreamIds = new Set<string>()
      for (const targetId of divergenceTargets) {
        const downstream = this.collectAllDownstream(targetId, edges, activities)
        downstream.forEach((act) => downstreamIds.add(act.id))
      }

      // If at least 2 branches reach this converge node, use it
      const branchesReachingConverge = convergeBranches.filter((branchId) => downstreamIds.has(branchId))
      if (branchesReachingConverge.length >= 2) {
        return { convergencePoint: node.id, convergeNode: node }
      }
    }

    return null
  }

  /**
   * Collect branches with partial convergence support
   */
  private static collectBranchesWithPartialConvergence(
    divergenceTargets: string[],
    convergencePoint: string | null,
    convergeBranchSet: Set<string>,
    edges: EdgeConnection[],
    activities: Activity[]
  ): Activity[][] {
    return divergenceTargets.map((targetId) => {
      if (!convergencePoint) {
        return this.collectAllDownstream(targetId, edges, activities)
      }

      // Check if this branch reaches the converge point
      const branchActivities = this.collectBranchActivities(targetId, convergencePoint, edges, activities)
      const branchActivityIds = new Set(branchActivities.map((a) => a.id))
      const reachesConvergePoint = Array.from(convergeBranchSet).some((branchId) => branchActivityIds.has(branchId))

      if (!reachesConvergePoint) {
        // This branch doesn't converge - collect all downstream but exclude the converge node
        const allDownstream = this.collectBranchActivitiesNoStop(targetId, edges, activities)
        return allDownstream.filter((a) => a.id !== convergencePoint)
      }

      return branchActivities
    })
  }

  /**
   * Check if source uses structural handles (true/false/loop)
   */
  private static hasStructuralHandles(sourceId: string, edges: EdgeConnection[]): boolean {
    return edges.some(
      (e) =>
        e.source === sourceId &&
        (e.sourceHandle === EdgeHandleEnum.TRUE ||
          e.sourceHandle === EdgeHandleEnum.FALSE ||
          e.sourceHandle === EdgeHandleEnum.LOOP)
    )
  }

  /**
   * Get valid divergence targets from external source
   */
  private static getValidDivergenceTargets(
    sourceId: string,
    edges: EdgeConnection[],
    activityIds: Set<string>
  ): string[] | null {
    const outgoingEdges = edges.filter((e) => e.source === sourceId)
    if (outgoingEdges.length < 2) return null

    const regularHandles = outgoingEdges.filter(
      (e) => !e.sourceHandle || e.sourceHandle === EdgeHandleEnum.SOURCE || e.sourceHandle === EdgeHandleEnum.DONE
    )
    if (regularHandles.length < 2) return null

    const validTargets = regularHandles.filter((e) => activityIds.has(e.target))
    if (validTargets.length < 2) return null

    return validTargets.map((e) => e.target)
  }

  /**
   * Find convergence point supporting both full and partial convergence
   */
  private static findConvergencePointWithPartialSupport(
    divergenceTargets: string[],
    edges: EdgeConnection[],
    activities: Activity[]
  ): { convergencePoint: string | null; convergeNode: Activity | undefined } {
    const convergencePoint = this.findConvergencePoint(divergenceTargets, edges, activities)

    if (convergencePoint) {
      return { convergencePoint, convergeNode: undefined }
    }

    // If no convergence point found via reachability, check for partial convergence
    const partialConverge = this.findPartialConvergeNode(divergenceTargets, edges, activities)
    if (partialConverge) {
      return {
        convergencePoint: partialConverge.convergencePoint,
        convergeNode: partialConverge.convergeNode,
      }
    }

    return { convergencePoint: null, convergeNode: undefined }
  }

  /**
   * Determine final converge node for external source
   */
  private static determineFinalConvergeNode(
    sourceId: string,
    convergencePoint: string | null,
    convergeNode: Activity | undefined,
    edges: EdgeConnection[],
    activities: Activity[]
  ): Activity | undefined {
    const hasStructuralHandle = this.hasStructuralHandles(sourceId, edges)

    // Structural nodes (conditions/loops) should not include converge nodes at top level
    if (hasStructuralHandle) {
      return undefined
    }

    if (convergeNode) {
      return convergeNode
    }

    if (convergencePoint) {
      return activities.find((a) => a.id === convergencePoint)!
    }

    return undefined
  }

  /**
   * Find parallel group from external sources (e.g., triggers)
   */
  private static findParallelFromExternalSource(activities: Activity[], edges: EdgeConnection[]): ParallelGroup | null {
    const activityIds = new Set(activities.map((a) => a.id))
    const externalSources = this.findExternalSources(activities, edges)

    for (const sourceId of externalSources) {
      const divergenceTargets = this.getValidDivergenceTargets(sourceId, edges, activityIds)
      if (!divergenceTargets) continue

      const { convergencePoint, convergeNode } = this.findConvergencePointWithPartialSupport(
        divergenceTargets,
        edges,
        activities
      )

      const convergeBranchSet = convergeNode
        ? new Set((convergeNode as Extract<Activity, { type: 'converge' }>).converge?.branches || [])
        : new Set<string>()

      const branches = this.collectBranchesWithPartialConvergence(
        divergenceTargets,
        convergencePoint,
        convergeBranchSet,
        edges,
        activities
      )

      const finalConvergeNode = this.determineFinalConvergeNode(
        sourceId,
        convergencePoint,
        convergeNode,
        edges,
        activities
      )

      return {
        divergenceSource: sourceId,
        divergenceTargets,
        convergeNode: finalConvergeNode,
        branches,
      }
    }
    return null
  }

  /**
   * Determine which edge handles contain parallel branches
   */
  private static getParallelHandles(outgoingEdges: EdgeConnection[]): EdgeConnection[] | null {
    const regularHandles = outgoingEdges.filter(
      (e) => !e.sourceHandle || e.sourceHandle === EdgeHandleEnum.SOURCE || e.sourceHandle === EdgeHandleEnum.DONE
    )
    const trueHandles = outgoingEdges.filter((e) => e.sourceHandle === EdgeHandleEnum.TRUE)
    const falseHandles = outgoingEdges.filter((e) => e.sourceHandle === EdgeHandleEnum.FALSE)

    if (regularHandles.length >= 2) return regularHandles
    if (trueHandles.length >= 2) return trueHandles
    if (falseHandles.length >= 2) return falseHandles
    return null
  }

  /**
   * Find parallel group from activity divergence points
   */
  private static findParallelFromDivergence(
    activities: Activity[],
    edges: EdgeConnection[],
    activityIds: Set<string>
  ): ParallelGroup | null {
    for (const activity of activities) {
      const outgoingEdges = edges.filter((e) => e.source === activity.id)
      if (outgoingEdges.length < 2) continue

      const parallelHandles = this.getParallelHandles(outgoingEdges)
      if (!parallelHandles || parallelHandles.length < 2) continue

      const validTargets = parallelHandles.filter((e) => activityIds.has(e.target))
      if (validTargets.length < 2) continue

      // CRITICAL: Deduplicate target IDs - multiple edges can point to the same target
      // (e.g., duplicate edges from UI). Use Array.from(new Set()) to get unique targets.
      const divergenceTargets = Array.from(new Set(validTargets.map((e) => e.target)))

      // After deduplication, check if we still have at least 2 unique targets
      if (divergenceTargets.length < 2) continue

      // CRITICAL: Skip if divergence uses DIFFERENT structural handles (true vs false, or loop vs something else)
      // These represent condition/loop branches, not parallel execution
      // BUT: if multiple edges use the SAME structural handle (e.g., both true), that's a real parallel
      const parallelHandleTypes = new Set(parallelHandles.map((e) => e.sourceHandle ?? 'source'))
      if (
        parallelHandleTypes.size > 1 &&
        (parallelHandleTypes.has('true') || parallelHandleTypes.has('false') || parallelHandleTypes.has('loop'))
      ) {
        // Edges use DIFFERENT handles, including structural ones - skip this
        continue
      }

      // CRITICAL: Check for converge nodes first (they explicitly define convergence points)
      const partialConvergeResult = this.findPartialConvergeNode(divergenceTargets, edges, activities)
      const convergencePoint =
        partialConvergeResult?.convergencePoint ?? this.findConvergencePoint(divergenceTargets, edges, activities)
      const convergeNode =
        partialConvergeResult?.convergeNode ??
        (convergencePoint ? activities.find((a) => a.id === convergencePoint) : undefined)

      const branches = divergenceTargets.map((targetId) => {
        if (convergencePoint) {
          return this.collectBranchActivities(targetId, convergencePoint, edges, activities)
        } else {
          // No convergence point - collect all downstream but exclude any converge nodes
          const allDownstream = this.collectAllDownstream(targetId, edges, activities)
          // Filter out converge nodes that might be downstream (they should be at parent level)
          return allDownstream.filter((a) => a.type !== ActivityTypeEnum.CONVERGE)
        }
      })

      return {
        divergenceSource: activity.id,
        divergenceTargets,
        convergeNode,
        branches,
      }
    }
    return null
  }

  /**
   * Find the outermost parallel group (based on divergence points - nodes with multiple outgoing edges)
   */
  private static findOutermostParallelGroup(activities: Activity[], edges: EdgeConnection[]): ParallelGroup | null {
    // Try converge-based detection first
    const fromConverge = this.findParallelFromConverge(activities, edges)
    if (fromConverge) return fromConverge

    // Try external source detection (triggers)
    const fromExternal = this.findParallelFromExternalSource(activities, edges)
    if (fromExternal) return fromExternal

    // Try divergence-based detection
    const activityIds = new Set(activities.map((a) => a.id))
    return this.findParallelFromDivergence(activities, edges, activityIds)
  }

  /**
   * Find the divergence point for a set of branch ends
   */
  private static findDivergencePoint(
    branchEndIds: string[],
    edges: EdgeConnection[],
    activities: Activity[]
  ): { divergenceSource: string; divergenceTargets: string[] } | null {
    // Trace backwards from each branch end
    const paths = branchEndIds.map((id) => this.traceBackwards(id, edges, activities))

    // Find common ancestor with divergent edges
    for (const ancestor of paths[0]) {
      if (paths.every((p) => p.includes(ancestor))) {
        // Check if it has multiple outgoing edges
        const outgoing = edges.filter((e) => e.source === ancestor)

        if (outgoing.length >= 2) {
          // Filter to only targets that lead to the converge
          const relevantTargets = outgoing
            .map((e) => e.target)
            .filter((target) => branchEndIds.some((endId) => this.canReach(target, endId, edges)))

          if (relevantTargets.length === branchEndIds.length) {
            return {
              divergenceSource: ancestor,
              divergenceTargets: relevantTargets,
            }
          }
        }
      }
    }

    return null
  }

  /**
   * Trace backwards from an activity to find the path
   */
  private static traceBackwards(activityId: string, edges: EdgeConnection[], activities: Activity[]): string[] {
    const path: string[] = [activityId]
    let current = activityId

    while (true) {
      const incoming = edges.filter((e) => e.target === current)

      if (incoming.length === 0) break

      if (incoming.length > 1) {
        // Multiple incoming edges
        const activity = activities.find((a) => a.id === current)
        if (activity?.type === ActivityTypeEnum.CONVERGE) {
          // Use the first branch's path
          const firstBranch = activity.converge?.branches?.[0]
          if (firstBranch) {
            current = firstBranch
            continue
          }
        }
        break
      }

      current = incoming[0].source
      path.unshift(current)
    }

    return path
  }

  /**
   * Check if we can reach target from source
   */
  private static canReach(fromId: string, toId: string, edges: EdgeConnection[]): boolean {
    const visited = new Set<string>()
    const queue = [fromId]

    while (queue.length > 0) {
      const current = queue.shift()!

      if (current === toId) return true
      if (visited.has(current)) continue

      visited.add(current)

      const outgoing = edges.filter((e) => e.source === current)
      outgoing.forEach((e) => queue.push(e.target))
    }

    return false
  }

  /**
   * Find where diverging branches converge (if they do)
   * Returns the ID of the convergence point, or null if branches don't converge
   */
  private static findConvergencePoint(
    branchStartIds: string[],
    edges: EdgeConnection[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _activities: Activity[]
  ): string | null {
    if (branchStartIds.length < 2) return null

    // Trace forward from each branch to find all reachable nodes
    const reachableSets = branchStartIds.map((startId) => {
      const reachable = new Set<string>()
      const queue = [startId]
      const visited = new Set<string>()

      while (queue.length > 0) {
        const current = queue.shift()!
        if (visited.has(current)) continue

        visited.add(current)
        reachable.add(current)

        const outgoing = edges.filter((e) => e.source === current)
        outgoing.forEach((e) => queue.push(e.target))
      }

      return reachable
    })

    // Find common nodes reachable from all branches
    const commonNodes = Array.from(reachableSets[0]).filter((nodeId) =>
      reachableSets.every((reachable) => reachable.has(nodeId))
    )

    // Find the "earliest" common node (closest to divergence point)
    // by finding the one with shortest max distance from any branch
    let bestConvergence: string | null = null
    let minMaxDistance = Infinity

    for (const nodeId of commonNodes) {
      const distances = branchStartIds.map((startId) => this.shortestPath(startId, nodeId, edges))
      const maxDistance = Math.max(...distances.filter((d) => d !== Infinity))

      if (maxDistance < minMaxDistance) {
        minMaxDistance = maxDistance
        bestConvergence = nodeId
      }
    }

    return bestConvergence
  }

  /**
   * Find shortest path length between two nodes
   */
  private static shortestPath(fromId: string, toId: string, edges: EdgeConnection[]): number {
    if (fromId === toId) return 0

    const queue: Array<{ id: string; distance: number }> = [{ id: fromId, distance: 0 }]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const current = queue.shift()!

      if (current.id === toId) return current.distance
      if (visited.has(current.id)) continue

      visited.add(current.id)

      const outgoing = edges.filter((e) => e.source === current.id)
      outgoing.forEach((e) => queue.push({ id: e.target, distance: current.distance + 1 }))
    }

    return Infinity
  }

  /**
   * Collect all downstream activities from a starting point (no stop condition)
   */
  private static collectAllDownstream(startId: string, edges: EdgeConnection[], allActivities: Activity[]): Activity[] {
    const result: Activity[] = []
    const queue = [startId]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const activityId = queue.shift()!

      if (visited.has(activityId)) continue

      visited.add(activityId)
      const activity = allActivities.find((a) => a.id === activityId)
      if (activity) {
        result.push(activity)
      }

      // Follow outgoing edges
      const outgoing = edges.filter((e) => e.source === activityId)
      outgoing.forEach((e) => queue.push(e.target))
    }

    return result
  }

  /**
   * Collect activities from start to end (used for branch collection)
   */
  private static collectBranchActivities(
    startId: string,
    stopId: string,
    edges: EdgeConnection[],
    allActivities: Activity[]
  ): Activity[] {
    const branch: Activity[] = []
    const queue = [startId]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const activityId = queue.shift()!

      if (activityId === stopId || visited.has(activityId)) {
        continue
      }

      visited.add(activityId)
      const activity = allActivities.find((a) => a.id === activityId)
      if (activity) {
        branch.push(activity)
      }

      // Follow outgoing edges
      const outgoing = edges.filter((e) => e.source === activityId && e.target !== stopId)
      outgoing.forEach((e) => queue.push(e.target))
    }

    return branch
  }

  /**
   * Collect all downstream activities from start without a stop condition
   * Used for non-converging branches in partial convergence scenarios
   */
  private static collectBranchActivitiesNoStop(
    startId: string,
    edges: EdgeConnection[],
    allActivities: Activity[]
  ): Activity[] {
    const branch: Activity[] = []
    const queue = [startId]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const activityId = queue.shift()!

      if (visited.has(activityId)) {
        continue
      }

      visited.add(activityId)
      const activity = allActivities.find((a) => a.id === activityId)
      if (activity) {
        branch.push(activity)
      }

      // Follow all outgoing edges
      const outgoing = edges.filter((e) => e.source === activityId)
      outgoing.forEach((e) => queue.push(e.target))
    }

    return branch
  }

  /**
   * Wrap a parallel group in a parallel container, recursively processing branches
   */
  private static wrapInParallelRecursive(
    activities: Activity[],
    group: ParallelGroup,
    edges: EdgeConnection[]
  ): Activity[] {
    // Remove branch activities from top level (but KEEP converge node)
    // The converge node should remain as a top-level activity after the parallel container
    const branchActivityIds = new Set(group.branches.flatMap((b) => b.map((a) => a.id)))
    const convergeNodeId = group.convergeNode?.id
    const result = activities.filter((a) => {
      if (branchActivityIds.has(a.id)) return false
      // CRITICAL: Do NOT remove the converge node - it's a valid API activity
      // that should be preserved in the workflow structure
      return true
    })

    // Process each branch RECURSIVELY
    const processedBranches = group.branches.map((branchActivities) => {
      // Get edges within this branch
      const branchActivityIdSet = new Set(branchActivities.map((a) => a.id))
      const branchEdges = edges.filter((e) => branchActivityIdSet.has(e.source) && branchActivityIdSet.has(e.target))

      // Recursively nest this branch (will find inner parallels!)
      const nestedBranch = this.nest(branchActivities, branchEdges)

      if (nestedBranch.length === 1) {
        return nestedBranch[0]
      }

      // Wrap multiple activities in sequence
      return {
        type: ActivityTypeEnum.SEQUENCE,
        id: generateActivityId('sequence'),
        name: 'Branch sequence',
        steps: nestedBranch,
      } as Extract<Activity, { type: 'sequence' }>
    })

    // Create parallel container
    const parallelContainer: Extract<Activity, { type: 'parallel' }> = {
      type: ActivityTypeEnum.PARALLEL,
      id: generateActivityId('parallel'),
      name: 'Parallel execution',
      branches: processedBranches,
    }

    // Insert parallel container after divergence point
    const divergenceIndex = result.findIndex((a) => a.id === group.divergenceSource)
    result.splice(divergenceIndex + 1, 0, parallelContainer)

    // CRITICAL: Move converge node to appear AFTER the parallel container
    // This ensures the converge node follows the parallel execution in the workflow
    if (convergeNodeId) {
      const convergeIndex = result.findIndex((a) => a.id === convergeNodeId)
      if (convergeIndex !== -1 && convergeIndex !== divergenceIndex + 2) {
        // Remove from current position
        const [convergeNode] = result.splice(convergeIndex, 1)
        // Re-insert after parallel container
        result.splice(divergenceIndex + 2, 0, convergeNode)
      }
    }

    return result
  }
}
