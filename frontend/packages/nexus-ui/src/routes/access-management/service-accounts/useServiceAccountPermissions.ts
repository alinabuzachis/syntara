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

export function useServiceAccountPermissions(): ServiceAccountPermissions {
  const resourceType = 'service_account' as const
  const { allowed: canCreate, isChecking: isCheckingCreate, isError: isErrorCreate } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: isCheckingUpdate, isError: isErrorUpdate } = useCanI('update', resourceType)
  const { allowed: canDelete, isChecking: isCheckingDelete, isError: isErrorDelete } = useCanI('delete', resourceType)
  const {
    allowed: canRotateSecret,
    isChecking: isCheckingRotate,
    isError: isErrorRotate,
  } = useCanI('rotate_secret', resourceType)

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
