import { useCanI } from '../../../hooks/useCanI'

type GroupDetailPermissions = {
  canReadMembers: boolean
  canReadAssignments: boolean
  isLoading: boolean
}

/**
 * Permission checks for group detail page tabs.
 *
 * Note: the Members tab also has an existing `isAuthenticated` guard
 * (built-in Authenticated group never shows members). That check
 * is independent and handled in `GroupDetail.tsx`.
 */
export function useGroupDetailPermissions(): GroupDetailPermissions {
  const { allowed: canReadMembers, isChecking: isCheckingMembers } = useCanI('read', 'group')
  const { allowed: canReadAssignments, isChecking: isCheckingAssignments } = useCanI('read', 'role-assignment')

  return {
    canReadMembers,
    canReadAssignments,
    isLoading: isCheckingMembers || isCheckingAssignments,
  }
}
