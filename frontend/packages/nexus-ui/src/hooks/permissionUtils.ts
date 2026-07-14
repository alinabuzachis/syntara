/**
 * Shared types and helpers for permission checking.
 *
 * Used by `useCanI`, `usePermissionChecks`, nav filtering, and
 * the `DisabledWithTooltip` component.
 */

import { useCanI } from './useCanI'

export type PermissionRequirement = {
  action: string
  resourceType: string
}

/**
 * Generates a stable cache key for a permission check.
 * Format matches the policy naming convention: `resource_type:action`.
 */
export function permissionKey(check: PermissionRequirement): string {
  return `${check.resourceType}:${check.action}`
}

/**
 * Generates the standardized tooltip message for a disabled action.
 *
 * @param actionDescription - Human-readable description, e.g. "delete this workflow"
 * @param policyName - The policy identifier, e.g. "workflow:delete"
 */
export function permissionTooltip(actionDescription: string, policyName: string): string {
  return `To ${actionDescription}, you need a role with the ${policyName} policy. Contact your Admin to request access.`
}

export type ResourceCrudPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  isLoading: boolean
}

/**
 * Shared hook for create/update/delete permission checks on a resource type.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useResourceCrudPermissions(resourceType: string): ResourceCrudPermissions {
  const { allowed: canCreate, isChecking: isCheckingCreate } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: isCheckingUpdate } = useCanI('update', resourceType)
  const { allowed: canDelete, isChecking: isCheckingDelete } = useCanI('delete', resourceType)

  return {
    canCreate,
    canUpdate,
    canDelete,
    isLoading: isCheckingCreate || isCheckingUpdate || isCheckingDelete,
  }
}
