import { useQueries } from '@tanstack/react-query'

import { accessFetchClient } from '../access/accessClient'

type AccessManagementPermissions = {
  canReadUsers: boolean
  canReadGroups: boolean
  canReadProjects: boolean
  canReadAssignments: boolean
  canReadServiceAccounts: boolean
  /** System-scoped role:read — gates the global Roles hub tab. */
  canReadRoles: boolean
  /** System-scoped policy:read — gates the global Policies hub tab. */
  canReadPolicies: boolean
  canQueryAuthz: boolean
  canReadTokenRevocation: boolean
  /** `true` when the user may open the Access Management hub. */
  canAccessPage: boolean
  isLoading: boolean
}

type AmCanICheck = {
  action: string
  resource_type: string
  /** Widen to any project (project-admins). Omit for system-only gates. */
  check_any_project?: true
}

/** can_i checks used for tab and hub gating. */
const AM_CAN_I_CHECKS: readonly AmCanICheck[] = [
  { action: 'read', resource_type: 'user' },
  { action: 'read', resource_type: 'group' },
  { action: 'read', resource_type: 'project', check_any_project: true },
  { action: 'read', resource_type: 'role-assignment', check_any_project: true },
  { action: 'assign', resource_type: 'role-assignment', check_any_project: true },
  { action: 'read', resource_type: 'service_account', check_any_project: true },
  // Roles/Policies hub tabs stay system-scoped (no check_any_project).
  { action: 'read', resource_type: 'role' },
  { action: 'read', resource_type: 'policy' },
  { action: 'query', resource_type: 'authz' },
  { action: 'read', resource_type: 'admin:revocation' },
  // System-only SA read — used so project-auditor SA grants do not open the hub.
  { action: 'read', resource_type: 'service_account' },
] as const

function isAllowed(result: { data?: { data?: { allowed?: boolean } } }): boolean {
  return result.data?.data?.allowed === true
}

export function useAccessManagementPermissions(): AccessManagementPermissions {
  const results = useQueries({
    queries: AM_CAN_I_CHECKS.map((body) => ({
      queryKey: ['authz', 'can_i', body] as const,
      queryFn: () => accessFetchClient.POST('/authz/can_i', { body }),
      staleTime: Infinity,
      retry: false,
    })),
  })

  const [
    users,
    groups,
    projects,
    assignmentsRead,
    assignmentsAssign,
    serviceAccountsAnywhere,
    roles,
    policies,
    authz,
    tokenRevocation,
    serviceAccountsSystem,
  ] = results

  const canReadUsers = isAllowed(users)
  const canReadGroups = isAllowed(groups)
  const canReadProjects = isAllowed(projects)
  const canReadAssignments = isAllowed(assignmentsRead)
  const canAssignAssignments = isAllowed(assignmentsAssign)
  const canReadServiceAccounts = isAllowed(serviceAccountsAnywhere)
  const canIServiceAccountsSystem = isAllowed(serviceAccountsSystem)

  // Global Roles/Policies inventory is system-admin shaped — do not unlock via project grants.
  const canReadRoles = isAllowed(roles)
  const canReadPolicies = isAllowed(policies)
  const canQueryAuthz = isAllowed(authz)
  const canReadTokenRevocation = isAllowed(tokenRevocation)

  // Hub access: admin-worthy only. project:read / service_account:read (project)
  // alone must not open AM (shared with project-user / project-auditor).
  const canAccessPage =
    canReadUsers ||
    canReadGroups ||
    canReadAssignments ||
    canAssignAssignments ||
    canIServiceAccountsSystem ||
    canReadTokenRevocation ||
    canReadRoles ||
    canReadPolicies

  return {
    canReadUsers,
    canReadGroups,
    canReadProjects,
    canReadAssignments,
    canReadServiceAccounts,
    canReadRoles,
    canReadPolicies,
    canQueryAuthz,
    canReadTokenRevocation,
    canAccessPage,
    isLoading: results.some((r) => r.isLoading),
  }
}
