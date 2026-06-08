import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

type RolePermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  isLoading: boolean
  tooltips: {
    create: string
    update: string
    delete: string
  }
}

/**
 * Permission checks for role management actions.
 *
 * Checks: role:create, role:update, role:delete.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useRolePermissions(): RolePermissions {
  const resourceType = 'role' as const
  const { allowed: canCreate, isChecking: isCheckingCreate } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: isCheckingUpdate } = useCanI('update', resourceType)
  const { allowed: canDelete, isChecking: isCheckingDelete } = useCanI('delete', resourceType)

  return {
    canCreate,
    canUpdate,
    canDelete,
    isLoading: isCheckingCreate || isCheckingUpdate || isCheckingDelete,
    tooltips: {
      create: permissionTooltip('create a role', `${resourceType}:create`),
      update: permissionTooltip('edit this role', `${resourceType}:update`),
      delete: permissionTooltip('delete this role', `${resourceType}:delete`),
    },
  }
}
