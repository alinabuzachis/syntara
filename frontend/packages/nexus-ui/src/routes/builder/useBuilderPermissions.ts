import { useMemo } from 'react'

import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

export type BuilderPermissions = {
  canEdit: boolean
  canRun: boolean
  canDelete: boolean
  isLoading: boolean
  tooltips: {
    edit: string
    save: string
    publish: string
    unpublish: string
    run: string
    delete: string
  }
}

/**
 * Aggregates permission checks for the workflow builder.
 *
 * For new workflows `canEdit` reflects `workflow:create`;
 * for existing workflows it reflects `workflow:update`.
 * All values default to `false` (safe-false) until the checks resolve,
 * so the builder starts in read-only mode until permissions confirm edit access.
 */
export function useBuilderPermissions(isNew: boolean, isBuiltin = false): BuilderPermissions {
  const { allowed: canCreate, isChecking: c1 } = useCanI('create', 'workflow')
  const { allowed: canUpdate, isChecking: c2 } = useCanI('update', 'workflow')
  const { allowed: canDelete, isChecking: c3 } = useCanI('delete', 'workflow')
  const { allowed: canRun, isChecking: c4 } = useCanI('run', 'execution')

  return useMemo(() => {
    const isLoading = c1 || c2 || c3 || c4
    const rbacCanEdit = isNew ? canCreate : canUpdate
    const canEdit = isBuiltin ? false : rbacCanEdit
    const editTooltip = isNew
      ? permissionTooltip('create a workflow', 'workflow:create')
      : permissionTooltip('edit this workflow', 'workflow:update')
    const saveTooltip = isNew
      ? permissionTooltip('save a new workflow', 'workflow:create')
      : permissionTooltip('save changes to this workflow', 'workflow:update')

    return {
      canEdit,
      canRun,
      canDelete: isBuiltin ? false : canDelete,
      isLoading,
      tooltips: {
        edit: editTooltip,
        save: saveTooltip,
        publish: permissionTooltip('publish this workflow', 'workflow:update'),
        unpublish: permissionTooltip('unpublish this workflow', 'workflow:update'),
        run: permissionTooltip('run this workflow', 'execution:run'),
        delete: permissionTooltip('delete this workflow', 'workflow:delete'),
      },
    }
  }, [isNew, isBuiltin, canCreate, canUpdate, canDelete, canRun, c1, c2, c3, c4])
}
