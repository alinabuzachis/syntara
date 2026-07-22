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

type UseProjectPermissionsOptions = {
  /**
   * Concrete project for row/detail update/delete checks.
   * When omitted, only `project:create` is evaluated (hub chrome);
   * update/delete stay safe-false until scoped per row.
   */
  resourceProject?: string
}

/**
 * Permission checks for project management actions.
 *
 * - `project:create` stays unscoped `can_i` (system grant; creating a project
 *   is not a project-scoped action).
 * - `project:update` / `project:delete` require a concrete `resourceProject`
 *   (never any-project for destructive UI).
 */
export function useProjectPermissions(options?: UseProjectPermissionsOptions): ProjectPermissions {
  const resourceType = 'project' as const
  const resourceProject = options?.resourceProject
  const hasProject = Boolean(resourceProject)

  const { allowed: canCreate, isChecking: isCheckingCreate } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: isCheckingUpdate } = useCanI('update', resourceType, {
    resourceProject,
    enabled: hasProject,
  })
  const { allowed: canDelete, isChecking: isCheckingDelete } = useCanI('delete', resourceType, {
    resourceProject,
    enabled: hasProject,
  })

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
