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

type UseAssignmentPermissionsOptions = {
  /**
   * When set, check assign/revoke against this concrete project.
   * When omitted, use `check_any_project` (Assignments hub).
   */
  resourceProject?: string
}

/**
 * Permission checks for role assignment actions.
 *
 * Hub screens omit `resourceProject` (any-project). Project detail passes the
 * concrete project so mixed-scope users do not get false-enabled buttons.
 */
export function useAssignmentPermissions(options?: UseAssignmentPermissionsOptions): AssignmentPermissions {
  const canIOptions = options?.resourceProject
    ? { resourceProject: options.resourceProject }
    : { checkAnyProject: true as const }

  const { allowed: canAssign, isChecking: isCheckingAssign } = useCanI('assign', 'role-assignment', canIOptions)
  const { allowed: canRevoke, isChecking: isCheckingRevoke } = useCanI('revoke', 'role-assignment', canIOptions)

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
