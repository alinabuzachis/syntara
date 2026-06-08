import type { AuthzAPI } from '@ansible/nexus-contracts'
import { useMemo } from 'react'

import { accessClient } from '../access/accessClient'

type PermissionEntry = AuthzAPI.components['schemas']['PermissionEntry']

/**
 * Fetches all user permissions and determines which projects the user can perform approval:decide on.
 *
 * Uses the /authz/what_can_i endpoint to get all permissions in a single API call,
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
  const query = accessClient.useQuery(
    'post',
    '/authz/what_can_i',
    {},
    {
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      gcTime: 30 * 60 * 1000, // Keep in memory for 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    }
  )

  const result = useMemo(() => {
    const permissions = query.data?.permissions ?? []

    // Find approval:decide permissions (effect = 'allow', actions includes 'approval:decide')
    const decidePermissions = permissions.filter(
      (p: PermissionEntry) => p.effect === 'allow' && p.actions.includes('approval:decide')
    )

    // Check for system-level permission (scope is 'any', 'system', or undefined, AND no project specified)
    const hasSystemDecide = decidePermissions.some(
      (p: PermissionEntry) => !p.project && (!p.scope || p.scope === 'system' || p.scope === 'any')
    )

    // Extract project-scoped permissions
    const projectNames = new Set<string>(
      decidePermissions
        .filter((p: PermissionEntry) => p.scope === 'project' && p.project)
        .map((p: PermissionEntry) => p.project!)
    )

    return {
      canDecideAllProjects: hasSystemDecide,
      canDecideProjectNames: projectNames,
      isLoading: query.isLoading,
      error: query.error,
    }
  }, [query.data, query.isLoading, query.error])

  return result
}
