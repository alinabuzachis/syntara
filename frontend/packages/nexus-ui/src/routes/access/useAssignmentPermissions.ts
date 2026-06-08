import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

type AssignmentPermissions = {
  canAssign: boolean
  canRevoke: boolean
  isLoading: boolean
  tooltips: {
    assign: string
    revoke: string
  }
}

/**
 * Permission checks for role assignment actions.
 *
 * Checks: role-assignment:assign, role-assignment:revoke.
 * All values default to `false` (safe-false) until the checks resolve.
 *
 * Used by the Assignments hub tab, RoleAssignmentsPanel (User/Group detail),
 * and ProjectRoleAssignmentsTab.
 */
export function useAssignmentPermissions(): AssignmentPermissions {
  const { allowed: canAssign, isChecking: isCheckingAssign } = useCanI('assign', 'role-assignment')
  const { allowed: canRevoke, isChecking: isCheckingRevoke } = useCanI('revoke', 'role-assignment')

  return {
    canAssign,
    canRevoke,
    isLoading: isCheckingAssign || isCheckingRevoke,
    tooltips: {
      assign: permissionTooltip('assign a role', 'role-assignment:assign'),
      revoke: permissionTooltip('revoke this assignment', 'role-assignment:revoke'),
    },
  }
}
