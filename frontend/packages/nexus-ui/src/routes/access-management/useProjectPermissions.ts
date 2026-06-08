import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

type ProjectPermissions = {
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
 * Permission checks for project management actions.
 *
 * Checks: project:create, project:update, project:delete.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useProjectPermissions(): ProjectPermissions {
  const resourceType = 'project' as const
  const { allowed: canCreate, isChecking: isCheckingCreate } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: isCheckingUpdate } = useCanI('update', resourceType)
  const { allowed: canDelete, isChecking: isCheckingDelete } = useCanI('delete', resourceType)

  return {
    canCreate,
    canUpdate,
    canDelete,
    isLoading: isCheckingCreate || isCheckingUpdate || isCheckingDelete,
    tooltips: {
      create: permissionTooltip('create a project', `${resourceType}:create`),
      update: permissionTooltip('edit this project', `${resourceType}:update`),
      delete: permissionTooltip('delete this project', `${resourceType}:delete`),
    },
  }
}
