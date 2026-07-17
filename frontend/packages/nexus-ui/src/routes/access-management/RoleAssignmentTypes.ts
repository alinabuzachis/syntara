export const RolePrincipalType = {
  USER: 'user',
  GROUP: 'group',
  SERVICE_ACCOUNT: 'service_account',
} as const

export type RolePrincipalType = (typeof RolePrincipalType)[keyof typeof RolePrincipalType]

export const principalTypeLabel: Record<RolePrincipalType, string> = {
  user: 'user',
  group: 'group',
  service_account: 'service account',
}

export function buildAssignmentBody(
  principalType: RolePrincipalType,
  principalId: string,
  roleName: string
): { principal_id?: string; group_id?: string; role_name: string } {
  if (principalType === RolePrincipalType.GROUP) {
    return { group_id: principalId, role_name: roleName }
  }
  return { principal_id: principalId, role_name: roleName }
}
