import type { Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../../workflowTransform'
import type { ValidationError } from '../types'

interface BranchValidationConfig {
  /** Function to filter activities that need validation */
  nodeFilter: (activity: Activity) => boolean
  /** The sourceHandle value that is required */
  requiredHandle: string
  /** Display name for the node type (e.g., "Condition", "Approval") */
  nodeTypeName: string
  /** Display name for the required branch (e.g., "Then", "Approved") */
  branchName: string
  /** Prefix for error IDs (e.g., "condition-missing-then", "approval-missing-approved") */
  errorIdPrefix: string
  /** Rule name for the error (e.g., "condition-connections", "approval-connections") */
  ruleName: string
}

/**
 * Generic validation function for nodes that require at least one connection from a specific branch.
 *
 * This validates nodes with multiple outgoing handles where one branch is required and others
 * are optional (e.g., condition nodes require 'then' branch, approval nodes require 'approved' branch).
 */
export function validateBranchConnections(
  activities: Activity[],
  edges: EdgeConnection[],
  config: BranchValidationConfig
): ValidationError[] {
  const errors: ValidationError[] = []

  // Find all nodes matching the filter
  const targetNodes = activities.filter(config.nodeFilter)

  for (const node of targetNodes) {
    // Find outgoing edges from this node
    const outgoingEdges = edges.filter((e) => e.source === node.id)

    // Check for required branch
    const hasRequiredBranch = outgoingEdges.some((e) => e.sourceHandle === config.requiredHandle)

    if (!hasRequiredBranch) {
      errors.push({
        id: `${config.errorIdPrefix}-${node.id}`,
        severity: 'error',
        rule: config.ruleName,
        message: `${config.nodeTypeName} "${node.name ?? node.id}" is missing a connection from the '${config.branchName}' branch`,
        nodeId: node.id,
        suggestion: `Add a node and connect it from the "${config.branchName}" handle of this ${config.nodeTypeName.toLowerCase()} node`,
      })
    }
  }

  return errors
}
