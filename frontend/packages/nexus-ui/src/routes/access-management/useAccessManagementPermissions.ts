import { useQueries } from '@tanstack/react-query'

import { accessFetchClient } from '../access/accessClient'

type AccessManagementPermissions = {
  canReadUsers: boolean
  canReadGroups: boolean
  canReadProjects: boolean
  canReadAssignments: boolean
  canReadServiceAccounts: boolean
  canQueryAuthz: boolean
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
  { action: 'read', resource_type: 'service_account' },
  { action: 'query', resource_type: 'authz' },
  { action: 'read', resource_type: 'admin:revocation' },
] as const

function isAllowed(result: { data?: { data?: { allowed?: boolean } } }): boolean {
  return result.data?.data?.allowed === true
}

export function useAccessManagementPermissions(): AccessManagementPermissions {
  const results = useQueries({
    queries: AM_CHECKS.map((body) => ({
      queryKey: ['authz', 'can_i', body] as const,
      queryFn: () => accessFetchClient.POST('/authz/can_i', { body }),
      staleTime: Infinity,
      retry: false,
    })),
  })

  const [users, groups, projects, assignments, serviceAccounts, authz, tokenRevocation] = results

  const canReadUsers = isAllowed(users)
  const canReadGroups = isAllowed(groups)
  const canReadProjects = isAllowed(projects)
  const canReadAssignments = isAllowed(assignments)
  const canReadServiceAccounts = isAllowed(serviceAccounts)
  const canQueryAuthz = isAllowed(authz)
  const canReadTokenRevocation = isAllowed(tokenRevocation)

  return {
    canReadUsers,
    canReadGroups,
    canReadProjects,
    canReadAssignments,
    canReadServiceAccounts,
    canQueryAuthz,
    canReadTokenRevocation,
    canAccessPage:
      canReadUsers ||
      canReadGroups ||
      canReadProjects ||
      canReadAssignments ||
      canReadServiceAccounts ||
      canReadTokenRevocation,
    isLoading: results.some((r) => r.isLoading),
  }
}
