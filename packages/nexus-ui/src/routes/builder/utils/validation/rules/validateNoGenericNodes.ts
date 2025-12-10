import type { Activity } from '@ansible/nexus-contracts'

import type { ValidationError } from '../types'

/**
 * Recursively checks if an activity is a generic placeholder node.
 */
function isGenericNode(activity: Activity): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (activity as any).metadata?.__isGeneric === true
}

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
 * Validates that the workflow does not contain any generic placeholder nodes.
 *
 * Generic nodes are temporary placeholders that should be replaced with actual
 * node types before saving the workflow.
 *
 * This validation recursively checks all nested structures (loops, conditions, parallels)
 * to ensure no generic nodes are hidden inside.
 */
export function validateNoGenericNodes(activities: Activity[]): ValidationError[] {
  const errors: ValidationError[] = []
  const genericNodes = findActivities(activities, isGenericNode)

  for (const activity of genericNodes) {
    errors.push({
      id: `generic-node-${activity.id}`,
      severity: 'error',
      rule: 'no-generic-nodes',
      message: `Placeholder node "${activity.name || 'Untitled'}" must be configured before saving`,
      nodeId: activity.id,
      suggestion: 'Click on the placeholder node to select a node type and configure it',
    })
  }

  return errors
}
