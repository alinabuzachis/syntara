import { ActivityTypeEnum, EdgeHandleEnum } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../routes/builder/types/edge'

import type { Activity } from './workflowStoreTypes'

function getChildActivities(activity: Activity): Activity[] {
  switch (activity.type) {
    case ActivityTypeEnum.PARALLEL:
      return activity.branches ?? []
    case ActivityTypeEnum.SEQUENCE:
      return activity.steps ?? []
    case ActivityTypeEnum.CONDITION:
      return [...(activity.then ?? []), ...(activity.else ?? [])]
    case ActivityTypeEnum.LOOP:
      return activity.loop.do ?? []
    case ActivityTypeEnum.TASK:
    case ActivityTypeEnum.CONVERGE:
    case ActivityTypeEnum.APPROVAL:
      return []
  }
}

/**
 * Recursively collect all activity IDs from a list, including deeply nested descendants.
 */
export function collectAllActivityIds(activities: Activity[]): Set<string> {
  const ids = new Set<string>()
  function collect(activity: Activity): void {
    ids.add(activity.id)
    for (const child of getChildActivities(activity)) {
      collect(child)
    }
  }
  for (const activity of activities) {
    collect(activity)
  }
  return ids
}

/**
 * Recursively find an activity by ID in a list of activities
 */
export function findActivityById(activities: Activity[], targetId: string): Activity | null {
  for (const activity of activities) {
    if (activity.id === targetId) {
      return activity
    }
    if (activity.type === ActivityTypeEnum.PARALLEL && activity.branches) {
      for (const branch of activity.branches) {
        const found = findActivityById([branch], targetId)
        if (found) return found
      }
    } else if (activity.type === ActivityTypeEnum.SEQUENCE && activity.steps) {
      const found = findActivityById(activity.steps, targetId)
      if (found) return found
    } else if (activity.type === ActivityTypeEnum.CONDITION) {
      if (activity.then) {
        const found = findActivityById(activity.then, targetId)
        if (found) return found
      }
      if (activity.else) {
        const found = findActivityById(activity.else, targetId)
        if (found) return found
      }
    } else if (activity.type === ActivityTypeEnum.LOOP && activity.loop.do) {
      const found = findActivityById(activity.loop.do, targetId)
      if (found) return found
    }
  }
  return null
}

/**
 * Recursively remove an activity from a list, cleaning up parent structures
 */
export function removeActivityFromList(activities: Activity[], activityId: string): Activity[] {
  const filtered: Activity[] = []

  for (const activity of activities) {
    // Skip the activity we're removing
    if (activity.id === activityId) {
      continue
    }

    // For other activities, recursively check nested structures
    if (activity.type === ActivityTypeEnum.PARALLEL) {
      const updatedBranches = activity.branches
        ?.map((branch) => removeActivityFromList([branch], activityId)[0])
        .filter((branch): branch is Activity => branch !== undefined)

      // If parallel has less than 2 branches, it's invalid - skip or promote
      if (!updatedBranches || updatedBranches.length < 2) {
        if (updatedBranches?.length === 1) {
          filtered.push(updatedBranches[0])
        }
        continue
      }

      filtered.push({
        ...activity,
        branches: updatedBranches,
      })
    } else if (activity.type === ActivityTypeEnum.SEQUENCE) {
      const updatedSteps = activity.steps ? removeActivityFromList(activity.steps, activityId) : []

      // If sequence has no steps, skip it. If only one step, promote it
      if (updatedSteps.length === 0) {
        continue
      }
      if (updatedSteps.length === 1) {
        filtered.push(updatedSteps[0])
        continue
      }

      filtered.push({
        ...activity,
        steps: updatedSteps,
      })
    } else if (activity.type === ActivityTypeEnum.CONDITION) {
      const updatedThen = activity.then ? removeActivityFromList(activity.then, activityId) : []
      const updatedElse = activity.else ? removeActivityFromList(activity.else, activityId) : undefined

      filtered.push({
        ...activity,
        then: updatedThen,
        else: updatedElse,
      })
    } else if (activity.type === ActivityTypeEnum.LOOP) {
      const updatedDo = activity.loop.do ? removeActivityFromList(activity.loop.do, activityId) : []

      // IMPORTANT: Keep loop nodes even with empty do arrays
      // During editing, loop structure is defined by edges, not nested do array
      // The do array is only populated when saving to API format
      filtered.push({
        ...activity,
        loop: {
          ...activity.loop,
          do: updatedDo,
        },
      })
    } else {
      // For task, join, and other activities, just keep them
      filtered.push(activity)
    }
  }

  return filtered
}

/**
 * Recursively walk an activity list, applying `mapper` to the single activity
 * whose id matches `activityId` and recursing into nested containers for all
 * others.  Both updateActivityInList and replaceActivityInList delegate here so
 * the traversal logic lives in exactly one place.
 */
function mapActivityInList(
  activities: Activity[],
  activityId: string,
  mapper: (activity: Activity) => Activity
): Activity[] {
  return activities.map((activity) => {
    if (activity.id === activityId) {
      return mapper(activity)
    }

    if (activity.type === ActivityTypeEnum.PARALLEL) {
      return {
        ...activity,
        branches: activity.branches ? mapActivityInList(activity.branches, activityId, mapper) : activity.branches,
      }
    } else if (activity.type === ActivityTypeEnum.SEQUENCE) {
      return {
        ...activity,
        steps: activity.steps ? mapActivityInList(activity.steps, activityId, mapper) : activity.steps,
      }
    } else if (activity.type === ActivityTypeEnum.CONDITION) {
      return {
        ...activity,
        then: activity.then ? mapActivityInList(activity.then, activityId, mapper) : activity.then,
        else: activity.else ? mapActivityInList(activity.else, activityId, mapper) : activity.else,
      }
    } else if (activity.type === ActivityTypeEnum.LOOP) {
      return {
        ...activity,
        loop: {
          ...activity.loop,
          do: activity.loop.do ? mapActivityInList(activity.loop.do, activityId, mapper) : activity.loop.do,
        },
      }
    }

    return activity
  })
}

/** Merge `updates` into the matching activity (preserves existing fields). */
export function updateActivityInList(
  activities: Activity[],
  activityId: string,
  updates: Partial<Activity>
): Activity[] {
  return mapActivityInList(activities, activityId, (activity) => ({ ...activity, ...updates }) as Activity)
}

/**
 * Fully replace the matching activity, discarding all type-specific fields from
 * the old one.  The replacement is stored with `id` set to `activityId` so
 * position-dependent consumers (edges, converge nodes) continue to work.
 */
export function replaceActivityInList(activities: Activity[], activityId: string, newActivity: Activity): Activity[] {
  return mapActivityInList(activities, activityId, () => ({ ...newActivity, id: activityId }) as Activity)
}

/**
 * Returns the set of valid outgoing sourceHandle values for an activity type.
 * Used by replaceActivity to prune edges that become incompatible after a type change.
 */
export function getValidSourceHandles(activityType: Activity['type']): Set<string> {
  switch (activityType) {
    case ActivityTypeEnum.CONDITION:
      return new Set([EdgeHandleEnum.TRUE, EdgeHandleEnum.FALSE])
    case ActivityTypeEnum.LOOP:
      return new Set([EdgeHandleEnum.LOOP, EdgeHandleEnum.DONE])
    case ActivityTypeEnum.APPROVAL:
      return new Set([EdgeHandleEnum.APPROVED, EdgeHandleEnum.REJECTED])
    case ActivityTypeEnum.TASK:
    case ActivityTypeEnum.PARALLEL:
    case ActivityTypeEnum.SEQUENCE:
    case ActivityTypeEnum.CONVERGE:
      return new Set([EdgeHandleEnum.SOURCE])
  }
}

/**
 * Reorder top-level activities based on edge connections using topological sort.
 * Nested activities (inside parallel/sequence/condition/loop) are not reordered.
 */
export function reorderActivities(activities: Activity[], edges: EdgeConnection[]): Activity[] {
  // Only get top-level activity IDs (not nested ones in parallel/sequence/condition/loop)
  const topLevelActivityIds = new Set(activities.map((a) => a.id))

  // Build a map of nested activity ID -> top-level parent activity ID
  // Recursively collects ALL descendants, not just first-level children
  const activityToParentMap = new Map<string, string>()

  function collectDescendants(activity: Activity, topLevelId: string): void {
    const children = getChildActivities(activity)
    for (const child of children) {
      activityToParentMap.set(child.id, topLevelId)
      collectDescendants(child, topLevelId)
    }
  }

  for (const activity of activities) {
    collectDescendants(activity, activity.id)
  }

  // Build adjacency list and in-degree map from edges
  const adjacencyList = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  // Initialize all top-level activity nodes
  topLevelActivityIds.forEach((id) => {
    adjacencyList.set(id, [])
    inDegree.set(id, 0)
  })

  // Build graph from edges - map nested activities to their top-level parents
  // Only consider sequential edges (not structural edges like loop bodies or condition branches)
  edges.forEach((edge) => {
    const isBranchEdge =
      edge.sourceHandle === EdgeHandleEnum.LOOP ||
      edge.sourceHandle === EdgeHandleEnum.TRUE ||
      edge.sourceHandle === EdgeHandleEnum.FALSE ||
      edge.sourceHandle === EdgeHandleEnum.APPROVED ||
      edge.sourceHandle === EdgeHandleEnum.REJECTED
    const isLoopBackEdge = edge.targetHandle === EdgeHandleEnum.END
    const isSequentialEdge = !isBranchEdge && !isLoopBackEdge

    if (!isSequentialEdge) {
      return
    }

    // Map source and target to top-level activities (or keep as-is if already top-level)
    const mappedSource = activityToParentMap.get(edge.source) ?? edge.source
    const mappedTarget = activityToParentMap.get(edge.target) ?? edge.target

    // Only add edge if both source and target are top-level activities and they're different
    if (
      topLevelActivityIds.has(mappedSource) &&
      topLevelActivityIds.has(mappedTarget) &&
      mappedSource !== mappedTarget
    ) {
      const neighbors = adjacencyList.get(mappedSource) ?? []
      // Avoid duplicate edges
      if (!neighbors.includes(mappedTarget)) {
        neighbors.push(mappedTarget)
        adjacencyList.set(mappedSource, neighbors)
        inDegree.set(mappedTarget, (inDegree.get(mappedTarget) ?? 0) + 1)
      }
    }
  })

  // Perform topological sort using Kahn's algorithm
  const queue: string[] = []
  const sortedIds: string[] = []

  // Start with nodes that have no incoming edges
  inDegree.forEach((degree, id) => {
    if (degree === 0) {
      queue.push(id)
    }
  })

  // Process nodes in topological order
  while (queue.length > 0) {
    // Sort queue to ensure deterministic ordering when there are multiple valid orders
    queue.sort()
    const current = queue.shift()!
    sortedIds.push(current)

    const neighbors = adjacencyList.get(current) ?? []
    neighbors.forEach((neighbor) => {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) {
        queue.push(neighbor)
      }
    })
  }

  // If sortedIds doesn't contain all top-level activities, add remaining ones
  const sortedIdsSet = new Set(sortedIds)
  const remainingActivities = activities.filter((a) => !sortedIdsSet.has(a.id))

  // Rebuild activities array in topological order - only reordering top-level activities
  const reorderedActivities: Activity[] = []

  sortedIds.forEach((id) => {
    const activity = activities.find((a) => a.id === id)
    if (activity) {
      reorderedActivities.push(activity)
    }
  })

  // IMPORTANT: Always preserve all nodes even if they have no connections yet
  remainingActivities.forEach((activity) => {
    reorderedActivities.push(activity)
  })

  // Safety check: Ensure ALL activities from the input are present in the output
  activities.forEach((activity) => {
    if (!reorderedActivities.some((a) => a.id === activity.id)) {
      reorderedActivities.push(activity)
    }
  })

  return reorderedActivities
}
