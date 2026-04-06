import { ActivityTypeEnum, type Activity } from '@ansible/nexus-contracts'

import { getActivityMetadata } from '../../../../../stores/useWorkflowStore'
import type { ValidationError } from '../types'

/**
 * Recursively checks if an activity is a generic placeholder step (unconfigured canvas placeholder).
 */
function isGenericNode(activity: Activity): boolean {
  return getActivityMetadata(activity)?.__isGeneric === true
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
 * Validates that the workflow does not contain any generic placeholder steps.
 *
 * Generic placeholders are temporary canvas steps that should be replaced with actual
 * step types before saving the workflow.
 *
 * This validation recursively checks all nested structures (loops, conditions, parallels)
 * to ensure no generic placeholders are hidden inside.
 */
export function validateNoGenericNodes(activities: Activity[]): ValidationError[] {
  const errors: ValidationError[] = []
  const genericNodes = findActivities(activities, isGenericNode)

  for (const activity of genericNodes) {
    errors.push({
      id: `generic-node-${activity.id}`,
      severity: 'error',
      rule: 'no-generic-nodes',
      message: `Placeholder step "${activity.name || 'Untitled'}" must be configured before saving`,
      nodeId: activity.id,
      suggestion: 'Click on the placeholder step to select a step type and configure it',
    })
  }

  return errors
}
