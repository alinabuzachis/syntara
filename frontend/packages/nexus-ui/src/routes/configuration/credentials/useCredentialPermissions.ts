import { permissionTooltip } from '../../../hooks/permissionUtils'
import { useCanI } from '../../../hooks/useCanI'

type CredentialPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  isLoading: boolean
  tooltips: {
    create: string
    update: string
    enable: string
    delete: string
  }
}

/**
 * Permission checks for credential list page actions.
 *
 * Checks: credential:create, credential:update, credential:delete.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useCredentialPermissions(): CredentialPermissions {
  const resourceType = 'credential' as const
  const { allowed: canCreate, isChecking: isCheckingCreate } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: isCheckingUpdate } = useCanI('update', resourceType)
  const { allowed: canDelete, isChecking: isCheckingDelete } = useCanI('delete', resourceType)

  const updatePermission = `${resourceType}:update` as const

  return {
    canCreate,
    canUpdate,
    canDelete,
    isLoading: isCheckingCreate || isCheckingUpdate || isCheckingDelete,
    tooltips: {
      create: permissionTooltip('create a credential', `${resourceType}:create`),
      update: permissionTooltip('edit this credential', updatePermission),
      enable: permissionTooltip('enable or disable this credential', updatePermission),
      delete: permissionTooltip('delete this credential', `${resourceType}:delete`),
    },
  }
}
