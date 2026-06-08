import { useCanI } from '../../../hooks/useCanI'

type ProjectDetailPermissions = {
  canReadAssignments: boolean
  isLoading: boolean
}

/**
 * Permission checks for project detail page tabs.
 */
export function useProjectDetailPermissions(): ProjectDetailPermissions {
  const { allowed: canReadAssignments, isChecking } = useCanI('read', 'role-assignment')

  return {
    canReadAssignments,
    isLoading: isChecking,
  }
}
