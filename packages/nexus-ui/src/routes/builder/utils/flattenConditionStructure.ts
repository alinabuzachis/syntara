import type { Activity } from '@ansible/nexus-contracts'

/**
 * Flattens nested condition structures into a flat activities array.
 * This is the inverse of buildNestedConditionStructure - it extracts all
 * nested activities from then/else arrays and puts them in a flat array.
 *
 * This is called when loading a workflow to convert nested structures
 * (from API or old saves) into the flat format used during editing.
 *
 * @param activities - Array of activities (may have nested then/else)
 * @returns Flat array with all activities at top level, condition nodes have empty then/else
 */
export function flattenConditionStructure(activities: Activity[]): Activity[] {
  const result: Activity[] = []

  for (const activity of activities) {
    if (activity.type === 'condition') {
      // Extract nested activities from then/else branches
      const thenActivities = activity.then || []
      const elseActivities = activity.else || []

      // Recursively flatten nested conditions
      const flattenedThen = flattenConditionStructure(thenActivities)
      const flattenedElse = flattenConditionStructure(elseActivities)

      // Add the condition node itself with empty branches
      result.push({
        ...activity,
        then: [],
        else: [],
      } as Extract<Activity, { type: 'condition' }>)

      // Add all flattened nested activities to top level
      result.push(...flattenedThen, ...flattenedElse)
    } else if (activity.type === 'parallel') {
      // Handle parallel activities (for join nodes)
      const branches = activity.branches || []
      const flattenedBranches = branches.flatMap((branch) => flattenConditionStructure([branch]))

      // Add the parallel node itself
      result.push(activity)

      // Add flattened branch activities (if any escaped the parallel - shouldn't normally happen)
      // Note: For auto-generated parallels (parallel_for_*), branches stay inside
      // This is just a safety measure
      if (!activity.id.startsWith('parallel_for_')) {
        result.push(...flattenedBranches)
      }
    } else {
      // For other activity types, just add them as-is
      result.push(activity)
    }
  }

  return result
}
