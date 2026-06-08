import { permissionTooltip } from '../../../hooks/permissionUtils'
import { useCanI } from '../../../hooks/useCanI'

type UserIdentityPermissions = {
  canAttach: boolean
  canDetach: boolean
  isLoading: boolean
  tooltips: {
    attach: string
    detach: string
  }
}

/**
 * Permission checks for user identity management actions.
 *
 * Checks: user_identity:attach, user_identity:detach.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useUserIdentityPermissions(): UserIdentityPermissions {
  const { allowed: canAttach, isChecking: isCheckingAttach } = useCanI('attach', 'user_identity')
  const { allowed: canDetach, isChecking: isCheckingDetach } = useCanI('detach', 'user_identity')

  return {
    canAttach,
    canDetach,
    isLoading: isCheckingAttach || isCheckingDetach,
    tooltips: {
      attach: permissionTooltip('attach an identity', 'user_identity:attach'),
      detach: permissionTooltip('detach this identity', 'user_identity:detach'),
    },
  }
}
