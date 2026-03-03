import { ActivityTypeEnum, EdgeHandleEnum, type Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../../workflowTransform'
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
      if (activity.type === ActivityTypeEnum.LOOP && activity.loop?.do) {
        traverse(activity.loop.do)
      } else if (activity.type === ActivityTypeEnum.CONDITION) {
        if (activity.then) traverse(activity.then)
        if (activity.else) traverse(activity.else)
      } else if (activity.type === ActivityTypeEnum.PARALLEL && activity.branches) {
        traverse(activity.branches)
      }
    }
  }

  traverse(activities)
  return results
}

/**
 * Validates that loop nodes have at least one activity in their body.
 *
 * A loop node must have work to perform - it doesn't make sense to have an
 * empty loop.
 *
 * In the flat (builder) format, loop bodies are defined by edges from the 'loop' handle.
 * In the nested (API) format, loop bodies are in the 'do' array.
 *
 * This validation recursively checks all nested structures (loops, conditions, parallels)
 * to ensure all loop nodes, even those deeply nested, have at least one activity.
 */
export function validateLoopNodes(activities: Activity[], edges?: EdgeConnection[]): ValidationError[] {
  const errors: ValidationError[] = []
  const loopNodes = findActivities(activities, (activity) => activity.type === ActivityTypeEnum.LOOP)

  for (const loopNode of loopNodes) {
    let hasBody: boolean

    // If edges are provided, we're validating the flat format
    if (edges) {
      // Check if there are edges from the loop's 'loop' handle
      const loopEdges = edges.filter((e) => e.source === loopNode.id && e.sourceHandle === EdgeHandleEnum.LOOP)
      hasBody = loopEdges.length > 0
    } else {
      // No edges provided - validating nested format, check the 'do' array
      const loopActivities = loopNode.loop?.do || []
      hasBody = loopActivities.length > 0
    }

    if (!hasBody) {
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
