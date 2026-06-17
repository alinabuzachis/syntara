import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

type UserPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canRevoke: boolean
  isLoading: boolean
  tooltips: {
    create: string
    update: string
    delete: string
    revoke: string
  }
}

/**
 * Permission checks for user management actions.
 *
 * Checks: user:create, user:update, user:delete, admin:revocation:execute.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useUserPermissions(): UserPermissions {
  const resourceType = 'user' as const
  const { allowed: canCreate, isChecking: isCheckingCreate } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: isCheckingUpdate } = useCanI('update', resourceType)
  const { allowed: canDelete, isChecking: isCheckingDelete } = useCanI('delete', resourceType)
  const { allowed: canRevoke, isChecking: isCheckingRevoke } = useCanI('execute', 'admin:revocation')

  return {
    canCreate,
    canUpdate,
    canDelete,
    canRevoke,
    isLoading: isCheckingCreate || isCheckingUpdate || isCheckingDelete || isCheckingRevoke,
    tooltips: {
      create: permissionTooltip('create a user', `${resourceType}:create`),
      update: permissionTooltip('edit this user', `${resourceType}:update`),
      delete: permissionTooltip('delete this user', `${resourceType}:delete`),
      revoke: permissionTooltip('revoke tokens for this user', 'admin:revocation:execute'),
    },
  }
}
