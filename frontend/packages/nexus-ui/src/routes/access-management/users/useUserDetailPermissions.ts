import { authClient } from '../../../client'
import { useCanI } from '../../../hooks/useCanI'

type UserDetailPermissions = {
  canReadGroups: boolean
  canReadIdentities: boolean
  canReadAssignments: boolean
  isLoading: boolean
}

/**
 * Permission checks for user detail page tabs.
 *
 * Self-permission: when viewing your own profile, Identities and Assignments
 * tabs are always visible — even if the user lacks the system-wide `read`
 * permission for those resources.
 */
export function useUserDetailPermissions(viewedUserId: string | undefined): UserDetailPermissions {
  const { allowed: canReadGroups, isChecking: isCheckingGroups } = useCanI('read', 'group')
  const { allowed: canReadIdentitiesGlobal, isChecking: isCheckingIdentities } = useCanI('read', 'user_identity')
  const { allowed: canReadAssignmentsGlobal, isChecking: isCheckingAssignments } = useCanI('read', 'role-assignment')

  const meQuery = authClient.useQuery('get', '/auth/me')
  const currentUserId = meQuery.data?.id
  const isSelf = !!viewedUserId && !!currentUserId && viewedUserId === currentUserId

  return {
    canReadGroups,
    canReadIdentities: canReadIdentitiesGlobal || isSelf,
    canReadAssignments: canReadAssignmentsGlobal || isSelf,
    isLoading: isCheckingGroups || isCheckingIdentities || isCheckingAssignments || meQuery.isLoading,
  }
}
