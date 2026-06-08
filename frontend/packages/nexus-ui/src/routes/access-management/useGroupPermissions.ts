import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

type GroupPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canManageMembers: boolean
  isLoading: boolean
  tooltips: {
    create: string
    update: string
    delete: string
    manageMembers: string
  }
}

/**
 * Permission checks for group management actions.
 *
 * Checks: group:create, group:update, group:delete, group:manage-members.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useGroupPermissions(): GroupPermissions {
  const resourceType = 'group' as const
  const { allowed: canCreate, isChecking: c1 } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: c2 } = useCanI('update', resourceType)
  const { allowed: canDelete, isChecking: c3 } = useCanI('delete', resourceType)
  const { allowed: canManageMembers, isChecking: c4 } = useCanI('manage-members', resourceType)

  return {
    canCreate,
    canUpdate,
    canDelete,
    canManageMembers,
    isLoading: c1 || c2 || c3 || c4,
    tooltips: {
      create: permissionTooltip('create a group', `${resourceType}:create`),
      update: permissionTooltip('edit this group', `${resourceType}:update`),
      delete: permissionTooltip('delete this group', `${resourceType}:delete`),
      manageMembers: permissionTooltip('manage group members', `${resourceType}:manage-members`),
    },
  }
}
