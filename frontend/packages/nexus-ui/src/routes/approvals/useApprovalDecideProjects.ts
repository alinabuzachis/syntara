import { useMemo } from 'react'

import { useAllPermissions } from '../access/useAllPermissions'

/**
 * Fetches all user permissions and determines which projects the user can perform approval:decide on.
 *
 * Uses useAllPermissions to fetch all pages via cursor pagination,
 * then parses the response to extract approval:decide permissions at both system
 * and project levels.
 *
 * @returns Object containing:
 *   - canDecideAllProjects: true if user has system-level approval:decide permission
 *   - canDecideProjectNames: Set of project names where user has project-scoped approval:decide
 *   - isLoading: true while fetching permissions
 *   - error: Error object if the request failed
 */
export function useApprovalDecideProjects() {
  const { permissions, isLoading, error } = useAllPermissions()

  const { canDecideAllProjects, canDecideProjectNames } = useMemo(() => {
    const decidePermissions = permissions.filter((p) => p.effect === 'allow' && p.actions.includes('approval:decide'))

    const hasSystemDecide = decidePermissions.some(
      (p) => !p.project && (!p.scope || p.scope === 'system' || p.scope === 'any')
    )

    const projectNames = new Set<string>(
      decidePermissions.filter((p) => p.scope === 'project' && p.project).map((p) => p.project!)
    )

    return {
      canDecideAllProjects: hasSystemDecide,
      canDecideProjectNames: projectNames,
    }
  }, [permissions])

  return { canDecideAllProjects, canDecideProjectNames, isLoading, error }
}
