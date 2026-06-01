import { useQueries } from '@tanstack/react-query'

import { accessFetchClient } from '../access/accessClient'

type AccessManagementPermissions = {
  canReadUsers: boolean
  canReadGroups: boolean
  canReadProjects: boolean
  canReadAssignments: boolean
  canReadTokenRevocation: boolean
  /** `true` when the user has at least one of the AM permissions. */
  canAccessPage: boolean
  isLoading: boolean
}

const AM_CHECKS = [
  { action: 'read', resource_type: 'user' },
  { action: 'read', resource_type: 'group' },
  { action: 'read', resource_type: 'project' },
  { action: 'read', resource_type: 'role-assignment' },
  { action: 'read', resource_type: 'admin:revocation' },
] as const

export function useAccessManagementPermissions(): AccessManagementPermissions {
  const results = useQueries({
    queries: AM_CHECKS.map((body) => ({
      queryKey: ['authz', 'can_i', body] as const,
      queryFn: () => accessFetchClient.POST('/authz/can_i', { body }),
      staleTime: Infinity,
      retry: false,
    })),
  })

  const [usersResult, groupsResult, projectsResult, assignmentsResult, tokenRevocationResult] = results

  const canReadUsers = usersResult.data?.data?.allowed === true
  const canReadGroups = groupsResult.data?.data?.allowed === true
  const canReadProjects = projectsResult.data?.data?.allowed === true
  const canReadAssignments = assignmentsResult.data?.data?.allowed === true
  const canReadTokenRevocation = tokenRevocationResult.data?.data?.allowed === true

  return {
    canReadUsers,
    canReadGroups,
    canReadProjects,
    canReadAssignments,
    canReadTokenRevocation,
    canAccessPage: canReadUsers || canReadGroups || canReadProjects || canReadAssignments || canReadTokenRevocation,
    isLoading: results.some((r) => r.isLoading),
  }
}
