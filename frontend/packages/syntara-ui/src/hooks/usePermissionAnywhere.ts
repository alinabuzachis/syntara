import { useCanI } from './useCanI'

type UsePermissionAnywhereResult = {
  /** Whether the user has the permission at system scope or in any project. */
  allowed: boolean
  /** `true` while the permission check is still loading. */
  isChecking: boolean
  /** `true` when the permission check failed. */
  isError: boolean
}

/**
 * Permission check that is true if the user has the permission at system
 * scope **or** in any project (`POST /authz/can_i` with `check_any_project`).
 *
 * Use for hub/nav UI that must work for project-admins without a selected
 * project. Prefer plain `useCanI` with `resourceProject` when a concrete
 * project context is available.
 */
export function usePermissionAnywhere(action: string, resourceType: string): UsePermissionAnywhereResult {
  return useCanI(action, resourceType, { checkAnyProject: true })
}
