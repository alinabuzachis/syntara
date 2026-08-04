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

type UseRolePermissionsOptions = {
  /**
   * When set, check role CRUD against this concrete project (name or UUID).
   * When omitted, checks are system-scoped (global Roles hub).
   */
  resourceProject?: string
}

/**
 * Permission checks for role management actions.
 *
 * Pass `resourceProject` on project detail screens so a grant in project A
 * does not enable create/edit/delete on project B. Omit it on the system
 * Roles hub (system-scoped `can_i` only).
 */
export function useRolePermissions(options?: UseRolePermissionsOptions): RolePermissions {
  const resourceType = 'role' as const
  const canIOptions = options?.resourceProject ? { resourceProject: options.resourceProject } : undefined
  const { allowed: canCreate, isChecking: isCheckingCreate } = useCanI('create', resourceType, canIOptions)
  const { allowed: canUpdate, isChecking: isCheckingUpdate } = useCanI('update', resourceType, canIOptions)
  const { allowed: canDelete, isChecking: isCheckingDelete } = useCanI('delete', resourceType, canIOptions)

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
