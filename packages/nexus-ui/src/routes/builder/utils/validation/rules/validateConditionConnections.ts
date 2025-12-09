import type { Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../../workflowTransform'
import type { ValidationError } from '../types'

/**
 * Validates that condition nodes have a connection from the 'then' branch.
 *
 * A condition node must have:
 * - At least one outgoing edge with sourceHandle='true' (then branch)
 *
 * The 'else' branch is optional - if not connected, the workflow continues
 * with the next activity after the condition.
 */
export function validateConditionConnections(activities: Activity[], edges: EdgeConnection[]): ValidationError[] {
  const errors: ValidationError[] = []

  // Find all condition nodes
  const conditionNodes = activities.filter((a) => a.type === 'condition')

  for (const condition of conditionNodes) {
    // Find outgoing edges from this condition
    const outgoingEdges = edges.filter((e) => e.source === condition.id)

    // Check for 'then' branch (sourceHandle='true')
    const hasThenBranch = outgoingEdges.some((e) => e.sourceHandle === 'true')

    if (!hasThenBranch) {
      errors.push({
        id: `condition-missing-then-${condition.id}`,
        severity: 'error',
        rule: 'condition-connections',
        message: `Condition "${condition.name || condition.id}" is missing a connection from the 'Then' branch`,
        nodeId: condition.id,
        suggestion: 'Add a node and connect it from the "Then" handle of this condition node',
      })
    }

    // Note: Else branch is optional - no validation needed
  }

  return errors
}
