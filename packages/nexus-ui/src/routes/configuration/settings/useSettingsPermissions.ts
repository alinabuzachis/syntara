import { useCanI } from '../../../hooks/useCanI'

type SettingsPermissions = {
  canRead: boolean
  canWrite: boolean
}

/**
 * Checks whether the current user can read and/or write settings.
 *
 * Delegates to the shared `useCanI` hook for each check. Safe-false
 * defaults: both permissions are `false` until their API calls resolve.
 */
export function useSettingsPermissions(): SettingsPermissions {
  const { allowed: canRead } = useCanI('read', 'setting')
  const { allowed: canWrite } = useCanI('write', 'setting')

  return { canRead, canWrite }
}
