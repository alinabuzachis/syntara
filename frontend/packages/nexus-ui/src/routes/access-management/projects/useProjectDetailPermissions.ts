import { useCanI } from '../../../hooks/useCanI'

type ProjectDetailPermissions = {
  canReadAssignments: boolean
  isLoading: boolean
}

/**
 * Permission checks for project detail page tabs.
 *
 * Scoped to the concrete project so a grant in another project does not unlock
 * the Assignments tab here.
 */
export function useProjectDetailPermissions(resourceProject: string): ProjectDetailPermissions {
  const { allowed: canReadAssignments, isChecking } = useCanI('read', 'role-assignment', {
    resourceProject,
    enabled: Boolean(resourceProject),
  })

  return {
    canReadAssignments,
    isLoading: isChecking,
  }
}
