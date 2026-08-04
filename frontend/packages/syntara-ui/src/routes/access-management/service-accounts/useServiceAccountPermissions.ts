import { useMemo } from 'react'

import { permissionTooltip } from '../../../hooks/permissionUtils'
import { useCanI } from '../../../hooks/useCanI'

type ServiceAccountPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canRotateSecret: boolean
  isLoading: boolean
  isError: boolean
  tooltips: {
    create: string
    update: string
    delete: string
    rotateSecret: string
  }
}

type UseServiceAccountPermissionsOptions = {
  /**
   * Concrete project for detail/row actions. When omitted, only create uses
   * `check_any_project` (hub chrome); update/delete/rotate stay safe-false.
   */
  resourceProject?: string
}

export function useServiceAccountPermissions(options?: UseServiceAccountPermissionsOptions): ServiceAccountPermissions {
  const resourceType = 'service_account' as const
  const resourceProject = options?.resourceProject
  const hasProject = Boolean(resourceProject)

  const createOptions = hasProject ? { resourceProject } : { checkAnyProject: true as const }
  const destructiveOptions = hasProject ? { resourceProject, enabled: true } : { enabled: false }

  const {
    allowed: canCreate,
    isChecking: isCheckingCreate,
    isError: isErrorCreate,
  } = useCanI('create', resourceType, createOptions)
  const {
    allowed: canUpdate,
    isChecking: isCheckingUpdate,
    isError: isErrorUpdate,
  } = useCanI('update', resourceType, destructiveOptions)
  const {
    allowed: canDelete,
    isChecking: isCheckingDelete,
    isError: isErrorDelete,
  } = useCanI('delete', resourceType, destructiveOptions)
  const {
    allowed: canRotateSecret,
    isChecking: isCheckingRotate,
    isError: isErrorRotate,
  } = useCanI('rotate_secret', resourceType, destructiveOptions)

  return useMemo(
    () => ({
      canCreate,
      canUpdate,
      canDelete,
      canRotateSecret,
      isLoading: isCheckingCreate || isCheckingUpdate || isCheckingDelete || isCheckingRotate,
      isError: isErrorCreate || isErrorUpdate || isErrorDelete || isErrorRotate,
      tooltips: {
        create: permissionTooltip('create a service account', `${resourceType}:create`),
        update: permissionTooltip('edit this service account', `${resourceType}:update`),
        delete: permissionTooltip('delete this service account', `${resourceType}:delete`),
        rotateSecret: permissionTooltip('rotate this credential secret', `${resourceType}:rotate_secret`),
      },
    }),
    [
      canCreate,
      canUpdate,
      canDelete,
      canRotateSecret,
      isCheckingCreate,
      isCheckingUpdate,
      isCheckingDelete,
      isCheckingRotate,
      isErrorCreate,
      isErrorUpdate,
      isErrorDelete,
      isErrorRotate,
    ]
  )
}
