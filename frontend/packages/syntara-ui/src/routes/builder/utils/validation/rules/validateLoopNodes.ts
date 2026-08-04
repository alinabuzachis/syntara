import { ActivityTypeEnum, EdgeHandleEnum, type Activity } from '@syntara/contracts'

import type { EdgeConnection } from '../../../types/edge'
import type { ValidationError } from '../types'

/**
 * Validates that loop nodes have at least one activity in their body.
 *
 * A loop node must have work to perform - it doesn't make sense to have an
 * empty loop.
 *
 * In v2, loop bodies are always defined by edges from the 'loop' handle
 * (activities are flat, no nested 'do' array).
 */
export function validateLoopNodes(activities: Activity[], edges?: EdgeConnection[]): ValidationError[] {
  const errors: ValidationError[] = []
  const loopNodes = activities.filter((activity) => activity.type === ActivityTypeEnum.LOOP)

  for (const loopNode of loopNodes) {
    let hasBody: boolean

    if (edges) {
      // Check if there are edges from the loop's 'loop' handle
      const loopEdges = edges.filter((e) => e.source === loopNode.id && e.sourceHandle === EdgeHandleEnum.LOOP)
      hasBody = loopEdges.length > 0
    } else {
      // Without edges, we can't determine loop body in v2 flat format
      // Assume the loop has a body (conservative — avoids false positives)
      hasBody = true
    }

    if (!hasBody) {
      errors.push({
        id: `empty-loop-${loopNode.id}`,
        severity: 'error',
        rule: 'loop-must-have-activities',
        message: `Loop "${loopNode.name || 'Untitled'}" must have at least one activity in its body`,
        nodeId: loopNode.id,
        suggestion: 'Add activities to the loop body by connecting steps to the loop handle',
      })
    }
  }

  return errors
}
