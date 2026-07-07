import { type Activity } from '@ansible/nexus-contracts'

import type { ValidationError } from '../types'

/**
 * Recursively checks if an activity is a generic placeholder step (unconfigured canvas placeholder).
 *
 * SECURITY: Check metadata only, not config. The __isGeneric flag is set by createGenericActivity
 * in metadata, not config. Checking config would allow untrusted API responses to inject
 * __isGeneric: true in config to bypass save validation.
 */
function isGenericNode(activity: Activity): boolean {
  // In v2, generic nodes have metadata.__isGeneric = true
  const metadata = activity.metadata as Record<string, unknown> | undefined
  // SECURITY: Also check type === 'generic' to catch nodes where metadata was stripped
  // but the placeholder type remains (e.g., crafted workflow definitions)
  return metadata?.__isGeneric === true || activity.type === 'generic'
}

/**
 * Validates that the workflow does not contain any generic placeholder steps.
 *
 * Generic placeholders are temporary canvas steps that should be replaced with actual
 * step types before saving the workflow.
 *
 * In v2, activities are flat (no nested structures), so we just check all
 * activities in the top-level array.
 */
export function validateNoGenericNodes(activities: Activity[]): ValidationError[] {
  const errors: ValidationError[] = []
  const genericNodes = activities.filter(isGenericNode)

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
