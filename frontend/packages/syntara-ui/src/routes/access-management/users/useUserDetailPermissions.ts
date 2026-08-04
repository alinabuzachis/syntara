import { authClient } from '../../../client'
import { useCanI } from '../../../hooks/useCanI'

type UserDetailPermissions = {
  /** Whether the user can access the Users list page (user:read). */
  canReadUsers: boolean
  canReadGroups: boolean
  canReadIdentities: boolean
  canReadAssignments: boolean
  isLoading: boolean
}

/**
 * Permission checks for user detail page tabs.
 *
 * Self-permission: when viewing your own profile, Groups, Identities, and
 * Assignments tabs are always visible — even if the user lacks the
 * system-wide `read` permission for those resources.
 */
export function useUserDetailPermissions(viewedUserId: string | undefined): UserDetailPermissions {
  const { allowed: canReadUsers, isChecking: isCheckingUsers } = useCanI('read', 'user')
  const { allowed: canReadGroups, isChecking: isCheckingGroups } = useCanI('read', 'group')
  const { allowed: canReadIdentitiesGlobal, isChecking: isCheckingIdentities } = useCanI('read', 'user_identity')
  const { allowed: canReadAssignmentsGlobal, isChecking: isCheckingAssignments } = useCanI('read', 'role-assignment')

  const meQuery = authClient.useQuery('get', '/auth/me')
  const currentUserId = meQuery.data?.id
  const isSelf = !!viewedUserId && !!currentUserId && viewedUserId === currentUserId

  return {
    canReadUsers,
    canReadGroups: canReadGroups || isSelf,
    canReadIdentities: canReadIdentitiesGlobal || isSelf,
    canReadAssignments: canReadAssignmentsGlobal || isSelf,
    isLoading:
      isCheckingUsers || isCheckingGroups || isCheckingIdentities || isCheckingAssignments || meQuery.isLoading,
  }
}
