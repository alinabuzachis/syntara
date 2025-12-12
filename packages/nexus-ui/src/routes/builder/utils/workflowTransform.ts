import type { Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../types/edge'

export type { EdgeConnection }

export interface FlatWorkflow {
  activities: Activity[]
  edges: EdgeConnection[]
}

interface ParallelGroup {
  divergenceSource: string
  divergenceTargets: string[]
  convergeNode: Activity
  branches: Activity[][]
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
   * Gets the appropriate source handle for an activity based on its type.
   * Loop nodes use 'done' handle, all other nodes use 'source' handle.
   */
  private static getSourceHandle(activity: Activity): string {
    return activity.type === 'loop' ? 'done' : 'source'
  }

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

    // Generate sequential edges between top-level activities
    for (let i = 0; i < nestedActivities.length - 1; i++) {
      const current = nestedActivities[i]
      const next = nestedActivities[i + 1]

      // Skip condition nodes - they have explicit branch edges
      if (current.type === 'condition') {
        continue
      }

      // If current is parallel, create edges to next from each branch
      if (current.type === 'parallel') {
        const branches = current.branches || []

        // CRITICAL: If next is a converge node, only create edges from branches
        // that are referenced in the converge node's branches array (partial convergence)
        if (next.type === 'converge') {
          const convergeBranches = (next as Extract<Activity, { type: 'converge' }>).converge?.branches || []
          const convergeBranchSet = new Set(convergeBranches)

          for (const branch of branches) {
            const lastActivityId = this.getLastActivityId(branch)
            // Only create edge if this branch is supposed to converge
            if (convergeBranchSet.has(lastActivityId)) {
              const sourceActivity = this.findActivityById(branch, lastActivityId)
              edges.push({
                id: `${lastActivityId}-${next.id}`,
                source: lastActivityId,
                target: next.id,
                sourceHandle: sourceActivity ? this.getSourceHandle(sourceActivity) : 'source',
                targetHandle: 'target',
              })
            }
          }
        } else {
          // For non-converge activities, all branches connect
          for (const branch of branches) {
            // Use getLastActivityId to handle sequence wrappers that will be flattened away
            const sourceId = this.getLastActivityId(branch)
            const sourceActivity = this.findActivityById(branch, sourceId)
            edges.push({
              id: `${sourceId}-${next.id}`,
              source: sourceId,
              target: next.id,
              sourceHandle: sourceActivity ? this.getSourceHandle(sourceActivity) : 'source',
              targetHandle: 'target',
            })
          }
        }
        continue
      }

      // If next is parallel, create edges from current to each branch
      if (next.type === 'parallel') {
        const branches = next.branches || []
        for (const branch of branches) {
          // Use getFirstActivityId to handle sequence wrappers that will be flattened away
          const targetId = this.getFirstActivityId(branch)
          edges.push({
            id: `${current.id}-${targetId}`,
            source: current.id,
            target: targetId,
            sourceHandle: this.getSourceHandle(current),
            targetHandle: 'target',
          })
        }
        continue
      }

      // Regular sequential edge
      edges.push({
        id: `${current.id}-${next.id}`,
        source: current.id,
        target: next.id,
        sourceHandle: this.getSourceHandle(current),
        targetHandle: 'target',
      })
    }

    // Flatten each activity (recursively extract nested activities)
    for (const activity of nestedActivities) {
      this.flattenActivity(activity, activities, edges)
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

    // 2. No more parallels - nest loops (they can contain conditions)
    result = this.nestLoops(result, edges)

    // 3. Finally, nest conditions
    result = this.nestConditions(result, edges)

    return result
  }

  /**
   * Helper to get activity ID (handles both Activity objects and simple IDs in nested structures)
   */
  private static getActivityId(activity: Activity | string): string {
    return typeof activity === 'string' ? activity : activity.id
  }

  /**
   * Get the ID of the first real activity in a branch.
   * Sequences are flattened away, so we need to drill down to find the first actual activity.
   * Public to allow use in trigger edge generation.
   */
  static getFirstActivityId(activity: Activity): string {
    if (activity.type === 'sequence') {
      const steps = activity.steps || []
      if (steps.length > 0) {
        return this.getFirstActivityId(steps[0])
      }
    }
    return activity.id
  }

  /**
   * Get the ID of the last real activity in a branch.
   * Sequences are flattened away, so we need to drill down to find the last actual activity.
   */
  private static getLastActivityId(activity: Activity): string {
    if (activity.type === 'sequence') {
      const steps = activity.steps || []
      if (steps.length > 0) {
        return this.getLastActivityId(steps[steps.length - 1])
      }
    }
    return activity.id
  }

  /**
   * Search for an activity in a list of activities
   */
  private static searchInActivityList(activities: Activity[], targetId: string): Activity | null {
    for (const activity of activities) {
      const found = this.findActivityById(activity, targetId)
      if (found) return found
    }
    return null
  }

  /**
   * Get nested activities based on activity type
   */
  private static getNestedActivities(activity: Activity): Activity[] {
    switch (activity.type) {
      case 'sequence':
        return activity.steps || []
      case 'parallel':
        return activity.branches || []
      case 'loop':
        return activity.loop?.do || []
      case 'condition':
        return [...(activity.then || []), ...(activity.else || [])]
      default:
        return []
    }
  }

  /**
   * Recursively find an activity by ID within a nested structure
   */
  private static findActivityById(root: Activity, targetId: string): Activity | null {
    if (root.id === targetId) {
      return root
    }

    // Search in nested structures
    const nestedActivities = this.getNestedActivities(root)
    return this.searchInActivityList(nestedActivities, targetId)
  }

  /**
   * Collect IDs from a list of activities recursively
   */
  private static collectIdsFromList(activities: Activity[], ids: string[]): void {
    for (const activity of activities) {
      ids.push(activity.id)
      const nested = this.getNestedActivities(activity)
      if (nested.length > 0) {
        this.collectIdsFromList(nested, ids)
      }
    }
  }

  /**
   * Recursively collect all activity IDs within a nested structure
   */
  private static collectAllActivityIds(activity: Activity): string[] {
    const ids: string[] = []
    this.collectIdsFromList([activity], ids)
    return ids
  }

  /**
   * Recursively flatten an activity and its nested children
   */
  private static flattenActivity(activity: Activity, flatActivities: Activity[], edges: EdgeConnection[]): void {
    switch (activity.type) {
      case 'condition':
        this.flattenCondition(activity, flatActivities, edges)
        break
      case 'parallel':
        this.flattenParallel(activity, flatActivities, edges)
        break
      case 'sequence':
        this.flattenSequence(activity, flatActivities, edges)
        break
      case 'loop':
        this.flattenLoop(activity, flatActivities, edges)
        break
      default:
        // Regular activity (task, converge, etc.)
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
    const thenActivities = activity.then || []
    const elseActivities = activity.else || []

    // Add condition with empty branches
    flatActivities.push({
      ...activity,
      then: [],
      else: [],
    })

    // Generate edge to first activity in then branch
    if (thenActivities.length > 0) {
      const firstThen = thenActivities[0]

      // If first activity is a parallel, create edges to all branches
      if (firstThen.type === 'parallel') {
        const branches = (firstThen as Extract<Activity, { type: 'parallel' }>).branches || []
        for (const branch of branches) {
          edges.push({
            id: `${activity.id}-true-${this.getActivityId(branch)}`,
            source: activity.id,
            target: this.getActivityId(branch),
            sourceHandle: 'true',
            targetHandle: 'target',
          })
        }
      } else {
        edges.push({
          id: `${activity.id}-true-${this.getActivityId(firstThen)}`,
          source: activity.id,
          target: this.getActivityId(firstThen),
          sourceHandle: 'true',
          targetHandle: 'target',
        })
      }
    }

    // Generate edge to first activity in else branch
    if (elseActivities.length > 0) {
      const firstElse = elseActivities[0]

      // If first activity is a parallel, create edges to all branches
      if (firstElse.type === 'parallel') {
        const branches = (firstElse as Extract<Activity, { type: 'parallel' }>).branches || []
        for (const branch of branches) {
          edges.push({
            id: `${activity.id}-false-${this.getActivityId(branch)}`,
            source: activity.id,
            target: this.getActivityId(branch),
            sourceHandle: 'false',
            targetHandle: 'target',
          })
        }
      } else {
        edges.push({
          id: `${activity.id}-false-${this.getActivityId(firstElse)}`,
          source: activity.id,
          target: this.getActivityId(firstElse),
          sourceHandle: 'false',
          targetHandle: 'target',
        })
      }
    }

    // Generate sequential edges within branches
    this.generateSequentialEdges(thenActivities, edges)
    this.generateSequentialEdges(elseActivities, edges)

    // Recursively process nested activities
    for (const nested of [...thenActivities, ...elseActivities]) {
      this.flattenActivity(nested, flatActivities, edges)
    }
  }

  /**
   * Flatten a parallel node - extract all branches to top level
   */
  private static flattenParallel(
    activity: Extract<Activity, { type: 'parallel' }>,
    flatActivities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const branches = activity.branches || []

    // Extract ALL branches to top level (no parallel container in builder)
    for (const branch of branches) {
      this.flattenActivity(branch, flatActivities, edges)
    }

    // NOTE: Do NOT generate edges between parallel branches
    // Parallel branches execute concurrently, not sequentially
    // Edges from/to parallel branches are created in flatten() based on surrounding context
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
        sourceHandle: 'loop',
        targetHandle: 'target',
      })
    }

    // Generate sequential edges within loop body
    this.generateSequentialEdges(doActivities, edges)

    // Edge from last activity back to loop (back-edge uses 'end' handle)
    if (doActivities.length > 0) {
      const lastDo = doActivities[doActivities.length - 1]
      edges.push({
        id: `${this.getActivityId(lastDo)}-${activity.id}`,
        source: this.getActivityId(lastDo),
        target: activity.id,
        sourceHandle: this.getSourceHandle(lastDo),
        targetHandle: 'end',
      })
    }

    // Recursively process loop body
    for (const nested of doActivities) {
      this.flattenActivity(nested, flatActivities, edges)
    }
  }

  /**
   * Create edges from parallel branches to next activity (with partial convergence support)
   */
  private static createParallelToNextEdges(
    parallel: Extract<Activity, { type: 'parallel' }>,
    next: Activity,
    edges: EdgeConnection[]
  ): void {
    const branches = parallel.branches || []
    const nextId = this.getActivityId(next)

    // Partial convergence: only create edges from branches listed in converge node
    if (next.type === 'converge') {
      const convergeBranches = (next as Extract<Activity, { type: 'converge' }>).converge?.branches || []
      const convergeBranchSet = new Set(convergeBranches)

      for (const branch of branches) {
        const lastActivityId = this.getLastActivityId(branch)
        if (convergeBranchSet.has(lastActivityId)) {
          edges.push({
            id: `${lastActivityId}-${nextId}`,
            source: lastActivityId,
            target: nextId,
            sourceHandle: 'source',
            targetHandle: 'target',
          })
        }
      }
    } else {
      // All branches connect to next activity
      for (const branch of branches) {
        const lastActivityId = this.getLastActivityId(branch)
        edges.push({
          id: `${lastActivityId}-${nextId}`,
          source: lastActivityId,
          target: nextId,
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      }
    }
  }

  /**
   * Generate sequential edges between top-level activities
   */
  private static generateSequentialEdges(activities: Activity[], edges: EdgeConnection[]): void {
    for (let i = 0; i < activities.length - 1; i++) {
      const current = activities[i]
      const next = activities[i + 1]

      // Skip condition nodes (they have explicit branch edges)
      if (current.type === 'condition') continue

      // Parallel nodes need special edge handling to their branches
      if (current.type === 'parallel') {
        this.createParallelToNextEdges(current as Extract<Activity, { type: 'parallel' }>, next, edges)
        continue
      }

      // Regular sequential edge
      edges.push({
        id: `${this.getActivityId(current)}-${this.getActivityId(next)}`,
        source: this.getActivityId(current),
        target: this.getActivityId(next),
        sourceHandle: this.getSourceHandle(current),
        targetHandle: 'target',
      })
    }
  }

  /**
   * Nest loop nodes based on edges
   */
  private static nestLoops(flatActivities: Activity[], edges: EdgeConnection[]): Activity[] {
    let result = [...flatActivities]
    const loopActivities = result.filter((a) => a.type === 'loop')

    for (const loopActivity of loopActivities) {
      // Skip if already moved into another loop's body
      if (!result.some((a) => a.id === loopActivity.id)) {
        continue
      }

      // Find edge from loop handle (sourceHandle === 'loop')
      const loopEdges = edges.filter((e) => e.source === loopActivity.id && e.sourceHandle === 'loop')
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
            ...(loopActivity as Extract<Activity, { type: 'loop' }>).loop,
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
   * Nest condition nodes based on edges
   */
  private static nestConditions(flatActivities: Activity[], edges: EdgeConnection[]): Activity[] {
    let result = [...flatActivities]
    const conditionActivities = result.filter((a) => a.type === 'condition')

    for (const conditionActivity of conditionActivities) {
      // Skip if already moved into another condition's branches
      if (!result.some((a) => a.id === conditionActivity.id)) {
        continue
      }

      // Find edges from true/false handles
      const trueEdges = edges.filter((e) => e.source === conditionActivity.id && e.sourceHandle === 'true')
      const falseEdges = edges.filter((e) => e.source === conditionActivity.id && e.sourceHandle === 'false')

      const trueStartIds = trueEdges.map((e) => e.target)
      const falseStartIds = falseEdges.map((e) => e.target)

      // Find all activities belonging to each branch
      const thenActivities = this.findBranchActivities(trueStartIds, edges, result)
      const elseActivities = this.findBranchActivities(falseStartIds, edges, result)

      // Remove branch activities from top level
      const allBranchActivityIds = new Set([...thenActivities.map((a) => a.id), ...elseActivities.map((a) => a.id)])
      result = result.filter((a) => !allBranchActivityIds.has(a.id))

      // Recursively process nested conditions
      const processedThen = this.nestConditions(thenActivities, edges)
      const processedElse = this.nestConditions(elseActivities, edges)

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
   * Find all activities in a branch starting from the given IDs.
   *
   * Special handling: If multiple startIds exist but none of them are found in allActivities,
   * it likely means they've been wrapped in a parallel container. In this case, find and
   * return that parallel container instead.
   */
  private static findBranchActivities(
    startIds: string[],
    edges: EdgeConnection[],
    allActivities: Activity[]
  ): Activity[] {
    const result: Activity[] = []
    const visited = new Set<string>()

    // Check if any startIds exist in allActivities
    const foundStartIds = startIds.filter((id) => allActivities.some((a) => a.id === id))

    // If multiple startIds but none exist in allActivities, they may be wrapped in a parallel container
    if (startIds.length >= 2 && foundStartIds.length === 0) {
      // Look for a parallel container whose branches contain these startIds
      // CRITICAL: Check if startIds are reachable from branch roots, not just exact ID matches
      // This handles cases where branches are wrapped in sequences (e.g., sequence(A3, D))
      const parallelContainer = allActivities.find((a) => {
        if (a.type !== 'parallel') return false
        const branches = a.branches || []

        // For each startId, check if it's reachable from any branch
        return startIds.every((startId) => {
          return branches.some((branch) => {
            // Collect all activity IDs within this branch
            const branchActivityIds = this.collectAllActivityIds(branch)
            return branchActivityIds.includes(startId)
          })
        })
      })

      if (parallelContainer) {
        result.push(parallelContainer)

        // CRITICAL: Continue collecting activities that follow the parallel container
        // For example, if pattern is: Condition → (A1 || A2) → J (converge)
        // We need to include J in the condition's then/else branch
        // Find edges from any branch activity to an activity outside the parallel
        const branches = (parallelContainer as Extract<Activity, { type: 'parallel' }>).branches || []
        const branchActivityIds = new Set<string>()
        for (const branch of branches) {
          const ids = this.collectAllActivityIds(branch)
          ids.forEach((id) => branchActivityIds.add(id))
        }

        // Find outgoing edges from branch activities
        const outgoingEdges = edges.filter((e) => branchActivityIds.has(e.source) && !branchActivityIds.has(e.target))

        // Collect activities following the parallel
        for (const edge of outgoingEdges) {
          const afterActivities = this.collectSequentialActivities(edge.target, edges, allActivities, visited)
          result.push(...afterActivities)
        }

        return result
      }
    }

    // Normal case: collect activities from each startId
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
    if (visited.has(startId)) return []

    const activity = allActivities.find((a) => a.id === startId)
    if (!activity) return []

    visited.add(startId)
    const result = [activity]

    // CRITICAL: Don't follow edges from activities inside a parallel container to the converge node
    // Converge nodes mark the END of parallel branches and should not be included in branch collection
    // This prevents infinite recursion when nestConditions recursively processes parallel containers
    if (activity.type === 'parallel') {
      // For parallel containers, we've already collected the branches during parallel wrapping
      // Don't follow outgoing edges from the container itself
      return result
    }

    // Follow outgoing edges, but skip edges to converge nodes
    const outgoing = edges.filter((e) => {
      if (e.source !== startId) return false

      // Check if the target is a converge node
      const targetActivity = allActivities.find((a) => a.id === e.target)
      if (targetActivity?.type === 'converge') {
        // Don't follow edges to converge nodes - they mark the end of parallel branches
        return false
      }

      return true
    })

    for (const edge of outgoing) {
      const nextActivities = this.collectSequentialActivities(edge.target, edges, allActivities, visited)
      result.push(...nextActivities)
    }

    return result
  }

  /**
   * Find parallel group from converge nodes
   */
  private static findParallelFromConverge(activities: Activity[], edges: EdgeConnection[]): ParallelGroup | null {
    const convergeNodes = activities.filter((a) => a.type === 'converge')
    const allActivityIds = new Set(activities.map((a) => a.id))

    for (const converge of convergeNodes) {
      const branchEndIds = (converge as Extract<Activity, { type: 'converge' }>).converge?.branches || []

      if (branchEndIds.length < 2) continue

      // Skip if converge references wrapped activities (avoids infinite recursion)
      const missingBranches = branchEndIds.filter((id) => !allActivityIds.has(id))
      if (missingBranches.length > 0) continue

      const divergenceInfo = this.findDivergencePoint(branchEndIds, edges, activities)
      if (!divergenceInfo) continue

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
      const convergeBranchSet = new Set((converge as Extract<Activity, { type: 'converge' }>).converge?.branches || [])
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
   * Find parallel group from external sources (e.g., triggers)
   */
  private static findParallelFromExternalSource(activities: Activity[], edges: EdgeConnection[]): ParallelGroup | null {
    const activityIds = new Set(activities.map((a) => a.id))
    const externalSources = new Set<string>()

    for (const edge of edges) {
      if (!activityIds.has(edge.source)) {
        externalSources.add(edge.source)
      }
    }

    for (const sourceId of externalSources) {
      const outgoingEdges = edges.filter((e) => e.source === sourceId)
      if (outgoingEdges.length < 2) continue

      const regularHandles = outgoingEdges.filter(
        (e) => !e.sourceHandle || e.sourceHandle === 'source' || e.sourceHandle === 'done'
      )
      if (regularHandles.length < 2) continue

      const validTargets = regularHandles.filter((e) => activityIds.has(e.target))
      if (validTargets.length < 2) continue

      const divergenceTargets = validTargets.map((e) => e.target)
      const convergencePoint = this.findConvergencePoint(divergenceTargets, edges, activities)

      const branches = divergenceTargets.map((targetId) => {
        return convergencePoint
          ? this.collectBranchActivities(targetId, convergencePoint, edges, activities)
          : this.collectAllDownstream(targetId, edges, activities)
      })

      return {
        divergenceSource: sourceId,
        divergenceTargets,
        convergeNode: convergencePoint ? activities.find((a) => a.id === convergencePoint)! : undefined,
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
      (e) => !e.sourceHandle || e.sourceHandle === 'source' || e.sourceHandle === 'done'
    )
    const trueHandles = outgoingEdges.filter((e) => e.sourceHandle === 'true')
    const falseHandles = outgoingEdges.filter((e) => e.sourceHandle === 'false')

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

      const divergenceTargets = validTargets.map((e) => e.target)
      const convergencePoint = this.findConvergencePoint(divergenceTargets, edges, activities)

      const branches = divergenceTargets.map((targetId) => {
        return convergencePoint
          ? this.collectBranchActivities(targetId, convergencePoint, edges, activities)
          : this.collectAllDownstream(targetId, edges, activities)
      })

      return {
        divergenceSource: activity.id,
        divergenceTargets,
        convergeNode: convergencePoint ? activities.find((a) => a.id === convergencePoint)! : undefined,
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
        if (activity?.type === 'converge') {
          // Use the first branch's path
          const firstBranch = (activity as Extract<Activity, { type: 'converge' }>).converge?.branches?.[0]
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
        type: 'sequence',
        id: generateActivityId('sequence'),
        name: 'Branch sequence',
        steps: nestedBranch,
      } as Extract<Activity, { type: 'sequence' }>
    })

    // Create parallel container
    const parallelContainer: Extract<Activity, { type: 'parallel' }> = {
      type: 'parallel',
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
