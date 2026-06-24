import { useMemo } from 'react'

import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

import { useApprovalDecideProjects } from './useApprovalDecideProjects'

/**
 * Domain hook for approval-related permissions.
 *
 * Aggregates permission checks for approval read and decide actions,
 * following the pattern established in useWorkflowPermissions, useCredentialPermissions, etc.
 *
 * @param projectId - Optional project ID for project-scoped permission checks
 * @returns Object containing:
 *   - canRead: true if user has approval:read permission
 *   - canDecide: true if user has approval:decide permission (global or project-scoped)
 *   - isChecking: true while any permission check is loading
 *   - tooltips: Standard tooltip content for disabled actions
 *
 * @example
 * ```tsx
 * // Global permission check
 * const permissions = useApprovalPermissions()
 *
 * // Project-scoped permission check
 * const permissions = useApprovalPermissions(approval.project_id)
 *
 * if (permissions.isChecking) return <Spinner />
 * if (!permissions.canRead) return <EmptyStateAccessDenied />
 *
 * <DisabledWithTooltip isDisabled={!permissions.canDecide} content={permissions.tooltips.decide}>
 *   <Button isAriaDisabled={!permissions.canDecide} onClick={permissions.canDecide ? handleDecide : undefined}>
 *     Approve
 *   </Button>
 * </DisabledWithTooltip>
 * ```
 */
export function useApprovalPermissions(projectId?: string | null) {
  // Check global read/decide permissions
  const canReadGlobalQuery = useCanI('read', 'approval')
  const canDecideGlobalQuery = useCanI('decide', 'approval')

  // Get project-scoped approval:decide permissions using what_can_i endpoint
  // This returns ALL permissions and we parse them to find project-scoped ones
  const {
    canDecideAllProjects,
    canDecideProjectNames,
    isLoading: isLoadingDecideProjects,
  } = useApprovalDecideProjects()

  return useMemo(() => {
    // User can decide if they have:
    // 1. Global approval:decide permission (canDecideGlobalQuery.allowed OR canDecideAllProjects)
    // 2. Project-scoped approval:decide for THIS specific project
    const hasProjectDecide = projectId ? canDecideProjectNames.has(projectId) : false
    const canDecide = canDecideGlobalQuery.allowed || canDecideAllProjects || hasProjectDecide

    return {
      canRead: canReadGlobalQuery.allowed,
      canDecide,
      isChecking: canReadGlobalQuery.isChecking || canDecideGlobalQuery.isChecking || isLoadingDecideProjects,
      tooltips: {
        decide: permissionTooltip('decide on approvals', 'approval:decide'),
      },
    }
  }, [
    canReadGlobalQuery.allowed,
    canReadGlobalQuery.isChecking,
    canDecideGlobalQuery.allowed,
    canDecideGlobalQuery.isChecking,
    canDecideAllProjects,
    canDecideProjectNames,
    isLoadingDecideProjects,
    projectId,
  ])
}
