import type { Activity } from '@ansible/nexus-contracts'

interface EdgeConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

/**
 * Builds nested condition structures from flat activities and edges.
 * This function is called during save/serialization to convert the flat
 * representation (used during editing) into the nested structure expected by the API.
 *
 * For each condition activity:
 * - Finds edges from its true/false handles
 * - Recursively collects all downstream activities
 * - Moves them into then/else arrays
 * - Removes them from the top-level activities array
 *
 * @param activities - Flat array of all activities
 * @param edges - Array of edge connections
 * @returns Activities with condition nodes containing nested then/else branches
 */
export function buildNestedConditionStructure(activities: Activity[], edges: EdgeConnection[]): Activity[] {
  // Clone activities to avoid mutations
  let result = [...activities]

  // Find all condition activities
  const conditionActivities = result.filter((a) => a.type === 'condition')

  for (const conditionActivity of conditionActivities) {
    // Skip if this condition was already moved into another condition's branches
    if (!result.some((a) => a.id === conditionActivity.id)) {
      continue
    }

    // Find edges from this condition's true and false handles
    const trueEdges = edges.filter((edge) => edge.source === conditionActivity.id && edge.sourceHandle === 'true')
    const falseEdges = edges.filter((edge) => edge.source === conditionActivity.id && edge.sourceHandle === 'false')

    const trueStartIds = trueEdges.map((edge) => edge.target)
    const falseStartIds = falseEdges.map((edge) => edge.target)

    // Find all downstream activities for each branch
    // This includes both directly connected activities AND their sequential descendants
    const thenActivities = findBranchActivities(trueStartIds, edges, result)
    const elseActivities = findBranchActivities(falseStartIds, edges, result)

    // Collect ALL descendant activities for each branch (including children of nested conditions)
    // This ensures nested conditions can find their own branch activities
    const thenDescendants = collectAllDescendants(thenActivities, edges, result)
    const elseDescendants = collectAllDescendants(elseActivities, edges, result)

    // Remove all branch and descendant activities from main array
    const allBranchActivityIds = new Set([
      ...thenActivities.map((a) => a.id),
      ...elseActivities.map((a) => a.id),
      ...thenDescendants.map((a) => a.id),
      ...elseDescendants.map((a) => a.id),
    ])
    result = result.filter((a) => !allBranchActivityIds.has(a.id))

    // Recursively process nested conditions within the branches
    // Include descendants so nested conditions can find their children
    const processedThen = buildNestedConditionStructure([...thenActivities, ...thenDescendants], edges)
    const processedElse = buildNestedConditionStructure([...elseActivities, ...elseDescendants], edges)

    // Update the condition activity with the processed branches
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

  return result
}

/**
 * Finds all activities that belong to a condition branch.
 * This includes:
 * 1. Activities directly connected via the branch handle (true/false)
 * 2. Activities sequentially downstream from those (following sourceHandle: 'source' edges)
 *
 * For example, if A's false handle → A2, and A2 → B (sequential), both A2 and B
 * belong to A's false branch.
 *
 * When an activity is inside a parallel_for_* wrapper, includes the wrapper instead.
 */
function findBranchActivities(startIds: string[], edges: EdgeConnection[], allActivities: Activity[]): Activity[] {
  const branchActivities: Activity[] = []
  const visited = new Set<string>()
  const parallelWrappersToInclude = new Set<string>()

  // Helper to find an activity by ID and its parallel wrapper (if any)
  const findActivityAndWrapper = (id: string): { activity?: Activity; wrapper?: Activity } => {
    // Check top-level activities
    const topLevel = allActivities.find((a) => a.id === id)
    if (topLevel) return { activity: topLevel }

    // Search inside parallel_for_* wrappers
    for (const activity of allActivities) {
      if (activity.type === 'parallel' && activity.id.startsWith('parallel_for_')) {
        const branches = activity.branches || []
        const found = branches.find((b) => b.id === id)
        if (found) return { activity: found, wrapper: activity }
      }
    }

    return {}
  }

  // Queue for BFS traversal (only following sequential edges)
  const queue: string[] = [...startIds]

  while (queue.length > 0) {
    const activityId = queue.shift()!

    if (visited.has(activityId)) {
      continue
    }
    visited.add(activityId)

    // Find the activity (search both top-level and inside parallel wrappers)
    const { activity, wrapper } = findActivityAndWrapper(activityId)
    if (!activity) {
      continue
    }

    // If activity is inside a parallel wrapper, mark the wrapper for inclusion
    // but DON'T add the individual branch activity
    if (wrapper) {
      parallelWrappersToInclude.add(wrapper.id)
      // IMPORTANT: Don't follow sequential edges from activities inside parallel wrappers
      // The wrapper represents the relationship to downstream nodes (e.g., join nodes)
      // Following these edges would incorrectly include join nodes in the condition's branch
      continue
    } else {
      // Only add non-wrapped activities directly
      branchActivities.push(activity)
    }

    // Find sequential edges from this activity (sourceHandle: 'source')
    // These represent continuation within the branch
    const sequentialEdges = edges.filter((edge) => edge.source === activityId && edge.sourceHandle === 'source')

    // Add targets to queue to continue following the sequential chain
    for (const edge of sequentialEdges) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target)
      }
    }

    // NOTE: We do NOT follow true/false edges here - those are handled by
    // collectAllDescendants for nested conditions
  }

  // Add the parallel wrappers that were marked for inclusion
  for (const wrapperId of parallelWrappersToInclude) {
    const wrapper = allActivities.find((a) => a.id === wrapperId)
    if (wrapper && !branchActivities.some((ba) => ba.id === wrapper.id)) {
      branchActivities.push(wrapper)
    }
  }

  return branchActivities
}

/**
 * Collects all descendant activities for nested conditions in a branch.
 * This finds activities that are children of conditions in the branch
 * (e.g., if branch contains condition B, this finds B1 and B2).
 *
 * Also searches inside parallel_for_* wrappers since syncJoinBranches nests activities there.
 * When descendants are inside a parallel_for_* wrapper, includes the wrapper instead.
 */
function collectAllDescendants(
  branchActivities: Activity[],
  edges: EdgeConnection[],
  allActivities: Activity[]
): Activity[] {
  const descendants: Activity[] = []
  const visited = new Set<string>()
  const parallelWrappersToInclude = new Set<string>()

  // Helper to find an activity by ID and its parallel wrapper (if any)
  const findActivityAndWrapper = (id: string): { activity?: Activity; wrapper?: Activity } => {
    // Check top-level activities
    const topLevel = allActivities.find((a) => a.id === id)
    if (topLevel) return { activity: topLevel }

    // Search inside parallel_for_* wrappers
    for (const activity of allActivities) {
      if (activity.type === 'parallel' && activity.id.startsWith('parallel_for_')) {
        const branches = activity.branches || []
        const found = branches.find((b) => b.id === id)
        if (found) return { activity: found, wrapper: activity }
      }
    }

    return {}
  }

  // Helper to collect conditions from an activity (including inside parallel wrappers)
  const getConditionsToProcess = (activity: Activity): Activity[] => {
    if (activity.type === 'condition') {
      return [activity]
    }
    if (activity.type === 'parallel' && activity.id.startsWith('parallel_for_')) {
      const branches = activity.branches || []
      return branches.filter((b) => b.type === 'condition')
    }
    return []
  }

  // For each condition in the branch (including those inside parallel wrappers), collect its children
  for (const activity of branchActivities) {
    const conditionsToProcess = getConditionsToProcess(activity)

    for (const condition of conditionsToProcess) {
      // Find edges from this condition's true/false handles
      const conditionEdges = edges.filter(
        (edge) => edge.source === condition.id && (edge.sourceHandle === 'true' || edge.sourceHandle === 'false')
      )

      // Collect all activities reachable from these edges
      for (const edge of conditionEdges) {
        const { activity: descendant, wrapper } = findActivityAndWrapper(edge.target)
        if (!descendant) continue

        if (visited.has(descendant.id)) continue
        visited.add(descendant.id)

        // If descendant is inside a parallel wrapper, mark wrapper for inclusion
        // but DON'T add the individual descendant
        if (wrapper) {
          parallelWrappersToInclude.add(wrapper.id)
        } else {
          // Only add non-wrapped activities directly
          descendants.push(descendant)

          // Recursively collect descendants of this descendant
          const nestedDescendants = collectAllDescendants([descendant], edges, allActivities)
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

  // Add the parallel wrappers that were marked for inclusion
  for (const wrapperId of parallelWrappersToInclude) {
    const wrapper = allActivities.find((a) => a.id === wrapperId)
    if (wrapper && !descendants.some((d) => d.id === wrapper.id)) {
      descendants.push(wrapper)
    }
  }

  return descendants
}
