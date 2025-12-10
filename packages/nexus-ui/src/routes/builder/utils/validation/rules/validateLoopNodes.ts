import type { Activity } from '@ansible/nexus-contracts'

import type { ValidationError } from '../types'

/**
 * Recursively traverses a workflow structure and collects activities matching a predicate.
 * Handles nested structures: loops, conditions, and parallels.
 */
function findActivities(activities: Activity[], predicate: (activity: Activity) => boolean): Activity[] {
  const results: Activity[] = []

  const traverse = (acts: Activity[]) => {
    for (const activity of acts) {
      if (predicate(activity)) {
        results.push(activity)
      }

      // Recursively traverse nested structures
      if (activity.type === 'loop' && activity.loop?.do) {
        traverse(activity.loop.do)
      } else if (activity.type === 'condition') {
        if (activity.then) traverse(activity.then)
        if (activity.else) traverse(activity.else)
      } else if (activity.type === 'parallel' && activity.branches) {
        traverse(activity.branches)
      }
    }
  }

  traverse(activities)
  return results
}

/**
 * Validates that loop nodes have at least one activity in their 'do' array.
 *
 * A loop node must have work to perform - it doesn't make sense to have an
 * empty loop. The 'do' array should contain at least one activity.
 *
 * This validation recursively checks all nested structures (loops, conditions, parallels)
 * to ensure all loop nodes, even those deeply nested, have at least one activity.
 */
export function validateLoopNodes(activities: Activity[]): ValidationError[] {
  const errors: ValidationError[] = []
  const loopNodes = findActivities(activities, (activity) => activity.type === 'loop')

  for (const loopNode of loopNodes) {
    // Check if the loop's 'do' array is empty
    const loopActivities = loopNode.loop?.do || []

    if (loopActivities.length === 0) {
      errors.push({
        id: `empty-loop-${loopNode.id}`,
        severity: 'error',
        rule: 'loop-must-have-activities',
        message: `Loop "${loopNode.name || 'Untitled'}" must have at least one activity in its body`,
        nodeId: loopNode.id,
        suggestion: 'Add activities to the loop body by connecting nodes to the loop handle',
      })
    }
  }

  return errors
}
