import { useMemo } from 'react'
import { useParams } from 'wouter'

import { useActiveAdminCount } from '../../../hooks/useActiveAdminCount'
import { useAuthStore } from '../../../stores/useAuthStore'
import { isValidUUID } from '../../../utils/generateUUID'
import { getUserIdFromToken } from '../../../utils/jwtUtils'
import { accessClient } from '../../access/accessClient'
import {
  BUILTIN_ADMIN_TOGGLE_DISABLED_REASON,
  BUILTIN_ADMINS_GROUP_NAME,
  LAST_ADMIN_TOGGLE_DISABLED_REASON,
} from '../adminConstants'
import { splitFullName, type UserFormData } from '../userFormSchema'

type ToggleStatusResult = {
  canToggleStatus: boolean
  statusToggleDisabledReason: string | undefined
}

function computeToggleStatus(
  isBuiltinUser: boolean,
  isEnabled: boolean,
  isSelf: boolean,
  isLastAdmin: boolean
): ToggleStatusResult {
  // Builtin admin: can only be disabled by self, and only when other admins exist
  // Other admin users: can be disabled by anyone, but not if they're the last admin
  // Non-admin users: always toggleable
  const canToggleStatus = isBuiltinUser ? !isEnabled || (isSelf && !isLastAdmin) : !isLastAdmin
  let statusToggleDisabledReason: string | undefined
  if (canToggleStatus) {
    statusToggleDisabledReason = undefined
  } else if (isBuiltinUser) {
    statusToggleDisabledReason = BUILTIN_ADMIN_TOGGLE_DISABLED_REASON
  } else {
    statusToggleDisabledReason = LAST_ADMIN_TOGGLE_DISABLED_REASON
  }
  return { canToggleStatus, statusToggleDisabledReason }
}

function useStableFormValues(
  userData: { username: string; full_name: string | null; email?: string | null; is_enabled: boolean } | undefined
): UserFormData | undefined {
  const username = userData?.username
  const fullName = userData?.full_name ?? ''
  const email = userData?.email ?? ''
  const isEnabledVal = userData?.is_enabled

  return useMemo(
    () =>
      username !== undefined && isEnabledVal !== undefined
        ? { username, ...splitFullName(fullName), email, password: '', is_enabled: isEnabledVal }
        : undefined,
    [username, fullName, email, isEnabledVal]
  )
}

export function useUserFormData(isEdit: boolean) {
  const { userId } = useParams<{ userId: string }>()
  const isValidId = !!userId && isValidUUID(userId)

  const userQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}',
    { params: { path: { user_id: userId ?? '' } } },
    { enabled: isEdit && isValidId, retry: false }
  )

  const groupsQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}/groups',
    { params: { path: { user_id: userId ?? '' } } },
    { enabled: isEdit && isValidId }
  )

  const userData = userQuery.data
  const isBuiltinUser = !!userData?.is_builtin

  const isInAdminsGroup = (groupsQuery.data?.resources ?? []).some(
    (g) => g.name === BUILTIN_ADMINS_GROUP_NAME && g.is_builtin
  )

  const accessToken = useAuthStore((s) => s.accessToken)
  const currentUserId = getUserIdFromToken(accessToken)
  const isSelf = isEdit && userId === currentUserId

  const activeAdminCount = useActiveAdminCount(isInAdminsGroup)
  const isEnabled = userData?.is_enabled ?? true
  const isLastAdmin = isInAdminsGroup && isEnabled && activeAdminCount <= 1
  const { canToggleStatus, statusToggleDisabledReason } = computeToggleStatus(
    isBuiltinUser,
    isEnabled,
    isSelf,
    isLastAdmin
  )

  // Depend on scalar values instead of the userData ref so background refetches
  // that return identical data don't produce a new formValues object and reset the form.
  const formValues = useStableFormValues(userData)

  return {
    userId: userId ?? '',
    isValidId,
    userQuery,
    userData,
    isBuiltinUser,
    isSelf,
    canToggleStatus,
    statusToggleDisabledReason,
    formValues,
  }
}
