import type { Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../types/edge'

import {
  createEdgesFromWrapperBranches,
  createEdgesToWrapperBranches,
  findActivityAndWrapper,
  getJoinIdFromWrapper,
  isParallelWrapper,
} from './wrapperHelpers'

export type { EdgeConnection }

export interface FlatWorkflow {
  activities: Activity[]
  edges: EdgeConnection[]
}

/**
 * Symmetric workflow transformation utilities.
 *
 * This module provides a unified interface for converting between:
 * - Flat representation (activities + edges) - used during editing
 * - Nested representation (activities with then/else/branches) - used by API
 *
 * The symmetric design makes it easier to:
 * - Understand the bidirectional transformation
 * - Debug round-trip issues
 * - Validate correctness
 * - Reuse transformation logic
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
   * 1. Traverses nested structures (condition.then/else, parallel.branches, etc.)
   * 2. Extracts all activities into a flat array
   * 3. Generates edge connections representing the structure
   *
   * @param nestedActivities - Workflow activities with nested structures
   * @returns Flat activities array and edge connections
   *
   * @example
   * ```typescript
   * const nested = [
   *   {
   *     type: 'condition',
   *     id: 'C1',
   *     then: [{ type: 'task', id: 'T1' }],
   *     else: [{ type: 'task', id: 'T2' }]
   *   }
   * ]
   * const { activities, edges } = WorkflowTransform.flatten(nested)
   * // activities: [C1, T1, T2] (flat)
   * // edges: [C1-true-T1, C1-false-T2]
   * ```
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

      // Handle parallel_for_* wrappers as target - connect to each branch
      if (isParallelWrapper(next)) {
        edges.push(...createEdgesToWrapperBranches(current.id, next, this.getSourceHandle(current)))
        continue
      }

      // Skip parallel_for_* wrappers as sources - their branches connect directly
      if (isParallelWrapper(current)) {
        continue
      }

      // Check if current or next are user-created parallels
      const isCurrentUserParallel = current.type === 'parallel' && !isParallelWrapper(current)
      const isNextUserParallel = next.type === 'parallel' && !isParallelWrapper(next)

      // Handle user-created parallel → user-created parallel
      // Both containers will be flattened, so connect all current branches to all next branches
      if (isCurrentUserParallel && isNextUserParallel) {
        const currentBranches = current.branches || []
        const nextBranches = next.branches || []
        for (const currentBranch of currentBranches) {
          for (const nextBranch of nextBranches) {
            edges.push({
              id: `${currentBranch.id}-${nextBranch.id}`,
              source: currentBranch.id,
              target: nextBranch.id,
              sourceHandle: this.getSourceHandle(currentBranch),
              targetHandle: 'target',
            })
          }
        }
        continue
      }

      // Handle user-created parallel → regular activity
      // Parallel container will be flattened, so connect branches to next activity
      if (isCurrentUserParallel) {
        const branches = current.branches || []
        for (const branch of branches) {
          edges.push({
            id: `${branch.id}-${next.id}`,
            source: branch.id,
            target: next.id,
            sourceHandle: this.getSourceHandle(branch),
            targetHandle: 'target',
          })
        }
        continue
      }

      // Handle regular activity → user-created parallel
      // Parallel container will be flattened, so connect to all branches
      if (isNextUserParallel) {
        const branches = next.branches || []
        for (const branch of branches) {
          edges.push({
            id: `${current.id}-${branch.id}`,
            source: current.id,
            target: branch.id,
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

    // Process each activity - flatten and generate edges
    for (const activity of nestedActivities) {
      this.flattenActivity(activity, activities, edges)
    }

    return { activities, edges }
  }

  /**
   * Converts flat workflow representation to nested structure.
   *
   * This operation:
   * 1. Analyzes edge connections to determine structure
   * 2. Groups activities into condition branches, parallel branches, etc.
   * 3. Recursively nests activities according to their relationships
   *
   * @param flatActivities - Flat array of all activities
   * @param edges - Edge connections defining relationships
   * @param allActivities - Optional full context for finding activities when following edges (for recursive calls)
   * @returns Activities with nested structures (then/else/branches)
   *
   * @example
   * ```typescript
   * const activities = [
   *   { type: 'condition', id: 'C1', then: [], else: [] },
   *   { type: 'task', id: 'T1' },
   *   { type: 'task', id: 'T2' }
   * ]
   * const edges = [
   *   { source: 'C1', target: 'T1', sourceHandle: 'true' },
   *   { source: 'C1', target: 'T2', sourceHandle: 'false' }
   * ]
   * const nested = WorkflowTransform.nest(activities, edges)
   * // C1.then = [T1], C1.else = [T2]
   * ```
   */
  static nest(flatActivities: Activity[], edges: EdgeConnection[], allActivities?: Activity[]): Activity[] {
    // Use flatActivities as the search context if allActivities not provided
    const searchContext = allActivities || flatActivities

    // Clone to avoid mutations
    let result = [...flatActivities]

    // Find all loop activities and nest their bodies first
    // Process loops before conditions to handle nested structures correctly
    const loopActivities = result.filter((a) => a.type === 'loop')

    for (const loopActivity of loopActivities) {
      // Skip if already moved into another structure's branches
      if (!result.some((a) => a.id === loopActivity.id)) {
        continue
      }

      // Find edges from loop's 'loop' handle
      const loopEdges = edges.filter((e) => e.source === loopActivity.id && e.sourceHandle === 'loop')
      const loopStartIds = loopEdges.map((e) => e.target)

      // Find all activities in the loop body using the same approach as findBranchActivities
      // but stop at the loop's end handle instead of following all sequential edges
      const loopBodyActivities: Activity[] = []
      const loopBodyIds = new Set<string>()

      // Collect all activities between loop handle and end handle
      const visited = new Set<string>()
      const queue: string[] = [...loopStartIds]

      while (queue.length > 0) {
        const activityId = queue.shift()!
        if (visited.has(activityId)) continue
        visited.add(activityId)

        const activity = searchContext.find((a) => a.id === activityId)
        if (!activity) continue

        loopBodyActivities.push(activity)
        loopBodyIds.add(activityId)

        // Find outgoing edges (but don't follow edges back to the loop)
        // Include both 'source' (regular nodes) and 'done' (loop nodes) handles
        // Don't follow edges that connect back to the loop node itself (prevents infinite recursion)
        const outgoingEdges = edges.filter(
          (e) =>
            e.source === activityId &&
            (!e.sourceHandle || e.sourceHandle === 'source' || e.sourceHandle === 'done') &&
            e.target !== loopActivity.id
        )

        for (const edge of outgoingEdges) {
          if (!visited.has(edge.target)) {
            queue.push(edge.target)
          }
        }
      }

      if (loopBodyActivities.length > 0) {
        // Remove loop body activities from top level
        result = result.filter((a) => !loopBodyIds.has(a.id))

        // Filter out edges that connect back to the loop node
        // These edges define the loop boundary and shouldn't be followed when nesting the loop body
        // This prevents infinite recursion when processing nested loops
        const loopBodyEdges = edges.filter((e) => e.target !== loopActivity.id)

        // Recursively process nested structures in loop body
        const processedLoopBody = this.nest(loopBodyActivities, loopBodyEdges, searchContext)

        // Update loop with nested body
        const loopIndex = result.findIndex((a) => a.id === loopActivity.id)
        if (loopIndex !== -1) {
          const updatedLoop = {
            ...loopActivity,
            loop: {
              ...loopActivity.loop,
              do: processedLoopBody,
            },
          } as Extract<Activity, { type: 'loop' }>

          result[loopIndex] = updatedLoop
        }
      }
    }

    // Find all condition activities
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

      // Find all activities belonging to each branch (search in full context)
      const thenActivities = this.findBranchActivities(trueStartIds, edges, searchContext)
      const elseActivities = this.findBranchActivities(falseStartIds, edges, searchContext)

      // Collect all descendants (for nested conditions, search in full context)
      const thenDescendants = this.collectAllDescendants(thenActivities, edges, searchContext)
      const elseDescendants = this.collectAllDescendants(elseActivities, edges, searchContext)

      // Remove branch activities from top level
      const allBranchActivityIds = new Set([
        ...thenActivities.map((a) => a.id),
        ...elseActivities.map((a) => a.id),
        ...thenDescendants.map((a) => a.id),
        ...elseDescendants.map((a) => a.id),
      ])
      result = result.filter((a) => !allBranchActivityIds.has(a.id))

      // Recursively process nested conditions, passing searchContext for edge resolution
      const processedThen = this.nest([...thenActivities, ...thenDescendants], edges, searchContext)
      const processedElse = this.nest([...elseActivities, ...elseDescendants], edges, searchContext)

      // Update condition with nested branches
      const conditionIndex = result.findIndex((a) => a.id === conditionActivity.id)
      if (conditionIndex !== -1) {
        const updatedCondition = {
          ...conditionActivity,
          then: processedThen,
          else: processedElse.length > 0 ? processedElse : undefined,
        } as Extract<Activity, { type: 'condition' }>

        result[conditionIndex] = updatedCondition
      }
    }

    // Final cleanup: Remove any activities that ended up nested inside conditions
    // This handles cases where recursive processing found activities via searchContext
    // but they weren't in the current result array to be removed
    const nestedActivityIds = this.collectNestedActivityIds(result)
    result = result.filter((a) => !nestedActivityIds.has(a.id))

    return result
  }

  /**
   * Validates that a nested workflow structure can round-trip correctly.
   *
   * This performs:
   * 1. nested → flatten → nest
   * 2. Deep equality check of original vs final structure
   * 3. Returns validation result with details
   *
   * @param nestedActivities - Nested workflow to validate
   * @returns True if structure round-trips correctly
   *
   * @example
   * ```typescript
   * const isValid = WorkflowTransform.validate(workflow.activities)
   * if (!isValid) {
   *   console.error('Workflow has structural issues')
   * }
   * ```
   */
  static validate(nestedActivities: Activity[]): boolean {
    try {
      // Flatten
      const { activities, edges } = this.flatten(nestedActivities)

      // Re-nest
      const reNested = this.nest(activities, edges)

      // Deep comparison
      return this.deepEqual(nestedActivities, reNested)
    } catch {
      // Validation failed - return false without logging
      return false
    }
  }

  // ========== Private Helper Methods ==========

  private static flattenActivity(activity: Activity, flatActivities: Activity[], edges: EdgeConnection[]): void {
    if (activity.type === 'condition') {
      this.flattenCondition(activity, flatActivities, edges)
    } else if (activity.type === 'parallel') {
      this.flattenParallel(activity, flatActivities, edges)
    } else if (activity.type === 'sequence') {
      this.flattenSequence(activity, flatActivities, edges)
    } else if (activity.type === 'loop') {
      this.flattenLoop(activity, flatActivities, edges)
    } else {
      flatActivities.push(activity)
    }
  }

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
      if (isParallelWrapper(firstThen)) {
        edges.push(...createEdgesToWrapperBranches(activity.id, firstThen, 'true'))
      } else {
        edges.push({
          id: `${activity.id}-true-${firstThen.id}`,
          source: activity.id,
          target: firstThen.id,
          sourceHandle: 'true',
          targetHandle: 'target',
        })
      }
    }

    // Generate edge to first activity in else branch
    if (elseActivities.length > 0) {
      const firstElse = elseActivities[0]
      if (isParallelWrapper(firstElse)) {
        edges.push(...createEdgesToWrapperBranches(activity.id, firstElse, 'false'))
      } else {
        edges.push({
          id: `${activity.id}-false-${firstElse.id}`,
          source: activity.id,
          target: firstElse.id,
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

  private static flattenParallel(
    activity: Extract<Activity, { type: 'parallel' }>,
    flatActivities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const branches = activity.branches || []

    if (isParallelWrapper(activity)) {
      // Auto-generated wrapper - preserve with branches
      flatActivities.push(activity)

      // Extract join node ID
      const joinId = getJoinIdFromWrapper(activity.id)

      // Generate edges from each branch to join
      edges.push(...createEdgesFromWrapperBranches(activity, joinId))

      // Process nested activities in branches
      for (const branch of branches) {
        const branchFlat: Activity[] = []
        const branchEdges: EdgeConnection[] = []
        this.flattenActivity(branch, branchFlat, branchEdges)
        edges.push(...branchEdges)
      }
    } else {
      // User-created parallel - flatten to extract branch tasks
      // Parallel container is NOT added to canvas - branches become separate top-level activities
      // When branches connect to a join node, syncConvergeBranches() will auto-generate parallel_for_${joinId} wrapper

      // Extract and recursively flatten each branch
      for (const branch of branches) {
        this.flattenActivity(branch, flatActivities, edges)
      }

      // Generate sequential edges between branches (they execute in parallel, so no edges between them)
      // Each branch becomes an independent activity that can connect to downstream nodes
      // If they all connect to a join node, syncConvergeBranches() will wrap them in a parallel container
    }
  }

  private static flattenSequence(
    activity: Extract<Activity, { type: 'sequence' }>,
    flatActivities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const steps = activity.steps || []

    // Don't add sequence wrapper - just process steps
    // Generate edges between steps
    for (let i = 0; i < steps.length - 1; i++) {
      const current = steps[i]
      const next = steps[i + 1]

      // Check if current or next are user-created parallels
      const isCurrentUserParallel = current.type === 'parallel' && !isParallelWrapper(current)
      const isNextUserParallel = next.type === 'parallel' && !isParallelWrapper(next)

      // Handle user-created parallel → user-created parallel
      // Both containers will be flattened, so connect all current branches to all next branches
      if (isCurrentUserParallel && isNextUserParallel) {
        const currentBranches = current.branches || []
        const nextBranches = next.branches || []
        for (const currentBranch of currentBranches) {
          for (const nextBranch of nextBranches) {
            edges.push({
              id: `${currentBranch.id}-${nextBranch.id}`,
              source: currentBranch.id,
              target: nextBranch.id,
              sourceHandle: this.getSourceHandle(currentBranch),
              targetHandle: 'target',
            })
          }
        }
        continue
      }

      // Handle user-created parallel → regular activity
      // Parallel container will be flattened, so connect branches to next activity
      if (isCurrentUserParallel) {
        const branches = current.branches || []
        for (const branch of branches) {
          edges.push({
            id: `${branch.id}-${next.id}`,
            source: branch.id,
            target: next.id,
            sourceHandle: this.getSourceHandle(branch),
            targetHandle: 'target',
          })
        }
        continue
      }

      // Handle regular activity → user-created parallel
      // Parallel container will be flattened, so connect to all branches
      if (isNextUserParallel) {
        const branches = next.branches || []
        for (const branch of branches) {
          edges.push({
            id: `${current.id}-${branch.id}`,
            source: current.id,
            target: branch.id,
            sourceHandle: this.getSourceHandle(current),
            targetHandle: 'target',
          })
        }
        continue
      }

      edges.push({
        id: `${current.id}-${next.id}`,
        source: current.id,
        target: next.id,
        sourceHandle: 'source',
        targetHandle: 'target',
      })
    }

    // Recursively process steps
    for (const step of steps) {
      this.flattenActivity(step, flatActivities, edges)
    }
  }

  private static flattenLoop(
    activity: Extract<Activity, { type: 'loop' }>,
    flatActivities: Activity[],
    edges: EdgeConnection[]
  ): void {
    const doActivities = activity.loop.do || []

    // Add loop node with empty do array (activities will be flattened separately)
    flatActivities.push({
      ...activity,
      loop: {
        ...activity.loop,
        do: [],
      },
    })

    if (doActivities.length > 0) {
      // Generate edge from loop's 'loop' handle to first activity in body
      edges.push({
        id: `${activity.id}-loop-${doActivities[0].id}`,
        source: activity.id,
        target: doActivities[0].id,
        sourceHandle: 'loop',
        targetHandle: 'target',
      })

      // Generate sequential edges within the loop body
      this.generateSequentialEdges(doActivities, edges)

      // Generate loop-back edge from last activity to loop's 'end' handle
      const lastActivity = doActivities[doActivities.length - 1]
      edges.push({
        id: `${lastActivity.id}-${activity.id}-end`,
        source: lastActivity.id,
        target: activity.id,
        sourceHandle: this.getSourceHandle(lastActivity),
        targetHandle: 'end',
      })
    }

    // Recursively process body
    for (const nested of doActivities) {
      this.flattenActivity(nested, flatActivities, edges)
    }
  }

  private static generateSequentialEdges(activities: Activity[], edges: EdgeConnection[]): void {
    for (let i = 0; i < activities.length - 1; i++) {
      const current = activities[i]
      const next = activities[i + 1]

      if (isParallelWrapper(next)) {
        edges.push(...createEdgesToWrapperBranches(current.id, next, this.getSourceHandle(current)))
      } else {
        edges.push({
          id: `${current.id}-${next.id}`,
          source: current.id,
          target: next.id,
          sourceHandle: this.getSourceHandle(current),
          targetHandle: 'target',
        })
      }
    }
  }

  private static findBranchActivities(
    startIds: string[],
    edges: EdgeConnection[],
    allActivities: Activity[]
  ): Activity[] {
    const branchActivities: Activity[] = []
    const visited = new Set<string>()
    const parallelWrappersToInclude = new Set<string>()
    const queue: string[] = [...startIds]

    while (queue.length > 0) {
      const activityId = queue.shift()!

      if (visited.has(activityId)) {
        continue
      }
      visited.add(activityId)

      const { activity, wrapper } = findActivityAndWrapper(activityId, allActivities)
      if (!activity) {
        continue
      }

      if (wrapper) {
        parallelWrappersToInclude.add(wrapper.id)
        continue
      } else {
        branchActivities.push(activity)
      }

      // Find sequential edges
      // CRITICAL FIX: Also include edges with undefined sourceHandle to catch edges created via ButtonEdge
      // ButtonEdge-created edges may not have sourceHandle set, or it could be undefined
      // Include both 'source' (regular nodes) and 'done' (loop nodes) handles
      const sequentialEdges = edges.filter(
        (edge) =>
          edge.source === activityId &&
          (!edge.sourceHandle || edge.sourceHandle === 'source' || edge.sourceHandle === 'done')
      )

      for (const edge of sequentialEdges) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target)
        }
      }
    }

    // Add parallel wrappers
    for (const wrapperId of parallelWrappersToInclude) {
      const wrapper = allActivities.find((a) => a.id === wrapperId)
      if (wrapper && !branchActivities.some((ba) => ba.id === wrapper.id)) {
        branchActivities.push(wrapper)
      }
    }

    return branchActivities
  }

  private static collectAllDescendants(
    branchActivities: Activity[],
    edges: EdgeConnection[],
    allActivities: Activity[]
  ): Activity[] {
    const descendants: Activity[] = []
    const visited = new Set<string>()
    const parallelWrappersToInclude = new Set<string>()

    const getConditionsToProcess = (activity: Activity): Activity[] => {
      if (activity.type === 'condition') {
        return [activity]
      }
      if (isParallelWrapper(activity)) {
        const branches = activity.branches || []
        return branches.filter((b) => b.type === 'condition')
      }
      return []
    }

    for (const activity of branchActivities) {
      const conditionsToProcess = getConditionsToProcess(activity)

      for (const condition of conditionsToProcess) {
        const conditionEdges = edges.filter(
          (edge) => edge.source === condition.id && (edge.sourceHandle === 'true' || edge.sourceHandle === 'false')
        )

        for (const edge of conditionEdges) {
          const { activity: descendant, wrapper } = findActivityAndWrapper(edge.target, allActivities)
          if (!descendant) continue

          if (visited.has(descendant.id)) {
            continue
          }
          visited.add(descendant.id)

          if (wrapper) {
            parallelWrappersToInclude.add(wrapper.id)
          } else {
            descendants.push(descendant)

            const nestedDescendants = this.collectAllDescendants([descendant], edges, allActivities)
            for (const nested of nestedDescendants) {
              if (!visited.has(nested.id)) {
                visited.add(nested.id)
                descendants.push(nested)
              }
            }
          }
        }
      }
    }

    // Add parallel wrappers
    for (const wrapperId of parallelWrappersToInclude) {
      const wrapper = allActivities.find((a) => a.id === wrapperId)
      if (wrapper && !descendants.some((d) => d.id === wrapper.id)) {
        descendants.push(wrapper)
      }
    }

    return descendants
  }

  // Note: Wrapper helper methods moved to wrapperHelpers.ts to avoid duplication

  private static deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  /**
   * Collects all activity IDs that are nested inside condition branches or loop bodies.
   * This is used to remove duplicates after recursive processing.
   */
  private static collectNestedActivityIds(activities: Activity[]): Set<string> {
    const nestedIds = new Set<string>()

    for (const activity of activities) {
      if (activity.type === 'condition') {
        const thenActivities = activity.then || []
        const elseActivities = activity.else || []

        // Add IDs from then branch
        for (const thenActivity of thenActivities) {
          nestedIds.add(thenActivity.id)
          // Recursively collect from nested conditions
          const nestedThenIds = this.collectNestedActivityIds([thenActivity])
          nestedThenIds.forEach((id) => nestedIds.add(id))
        }

        // Add IDs from else branch
        for (const elseActivity of elseActivities) {
          nestedIds.add(elseActivity.id)
          // Recursively collect from nested conditions
          const nestedElseIds = this.collectNestedActivityIds([elseActivity])
          nestedElseIds.forEach((id) => nestedIds.add(id))
        }
      } else if (activity.type === 'loop') {
        const doActivities = activity.loop.do || []

        // Add IDs from loop body
        for (const doActivity of doActivities) {
          nestedIds.add(doActivity.id)
          // Recursively collect from nested structures in loop body
          const nestedDoIds = this.collectNestedActivityIds([doActivity])
          nestedDoIds.forEach((id) => nestedIds.add(id))
        }
      }
    }

    return nestedIds
  }
}
