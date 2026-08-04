import { useMemo } from 'react'

import { isSystemScope, projectScopedNames } from '../../hooks/permissionUtils'
import { useAllPermissions } from '../access/useAllPermissions'

/**
 * Fetches all user permissions and determines which projects the user can
 * perform approval:decide and approval:read on.
 *
 * Uses useAllPermissions to fetch all pages via cursor pagination,
 * then parses the response to extract approval permissions at both system
 * and project levels.
 *
 * @returns Object containing:
 *   - canDecideAllProjects: true if user has system-level approval:decide permission
 *   - canDecideProjectNames: Set of project names where user has project-scoped approval:decide
 *   - canReadProjectNames: Set of project names where user has project-scoped approval:read
 *   - isLoading: true while fetching permissions
 *   - error: Error object if the request failed
 */
export function useApprovalDecideProjects() {
  const { permissions, isLoading, error } = useAllPermissions()

  const { canDecideAllProjects, canDecideProjectNames, canReadProjectNames } = useMemo(() => {
    const decideEntries = permissions.filter((p) => p.effect === 'allow' && p.actions.includes('approval:decide'))
    const readEntries = permissions.filter((p) => p.effect === 'allow' && p.actions.includes('approval:read'))

    return {
      canDecideAllProjects: decideEntries.some(isSystemScope),
      canDecideProjectNames: projectScopedNames(decideEntries),
      canReadProjectNames: projectScopedNames(readEntries),
    }
  }, [permissions])

  return { canDecideAllProjects, canDecideProjectNames, canReadProjectNames, isLoading, error }
}
