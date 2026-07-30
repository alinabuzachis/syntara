import type { Activity } from '@syntara/contracts'

import type { EdgeConnection } from '../../../types/edge'
import type { ValidationError } from '../types'

import { validateBranchConnections } from './validateBranchConnections'

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
  return validateBranchConnections(activities, edges, {
    nodeFilter: (a) => a.type === 'condition',
    requiredHandle: 'true',
    nodeTypeName: 'Condition',
    branchName: 'Then',
    errorIdPrefix: 'condition-missing-then',
    ruleName: 'condition-connections',
  })
}
