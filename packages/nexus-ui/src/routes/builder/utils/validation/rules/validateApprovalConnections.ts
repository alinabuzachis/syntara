import { EdgeHandleEnum, type Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../../workflowTransform'
import type { ValidationError } from '../types'

import { validateBranchConnections } from './validateBranchConnections'

/**
 * Validates that approval nodes have a connection from the 'approved' branch.
 *
 * An approval node must have:
 * - At least one outgoing edge with sourceHandle='approved' (approved branch)
 *
 * The 'rejected' branch is optional - if not connected, the workflow may
 * fail or handle rejection differently based on configuration.
 */
export function validateApprovalConnections(activities: Activity[], edges: EdgeConnection[]): ValidationError[] {
  return validateBranchConnections(activities, edges, {
    nodeFilter: (a) => a.type === 'approval',
    requiredHandle: EdgeHandleEnum.APPROVED,
    nodeTypeName: 'Approval',
    branchName: 'Approved',
    errorIdPrefix: 'approval-missing-approved',
    ruleName: 'approval-connections',
  })
}
