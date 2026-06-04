import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

type WorkflowPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canRun: boolean
  isLoading: boolean
  tooltips: {
    create: string
    update: string
    delete: string
    run: string
  }
}

/**
 * Permission checks for workflow list page actions.
 *
 * Checks: workflow:create, workflow:update, workflow:delete, execution:run.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useWorkflowPermissions(): WorkflowPermissions {
  const resourceType = 'workflow' as const
  const { allowed: canCreate, isChecking: isCheckingCreate } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: isCheckingUpdate } = useCanI('update', resourceType)
  const { allowed: canDelete, isChecking: isCheckingDelete } = useCanI('delete', resourceType)
  const { allowed: canRun, isChecking: isCheckingRun } = useCanI('run', 'execution')

  return {
    canCreate,
    canUpdate,
    canDelete,
    canRun,
    isLoading: isCheckingCreate || isCheckingUpdate || isCheckingDelete || isCheckingRun,
    tooltips: {
      create: permissionTooltip('create a workflow', `${resourceType}:create`),
      update: permissionTooltip('edit this workflow', `${resourceType}:update`),
      delete: permissionTooltip('delete this workflow', `${resourceType}:delete`),
      run: permissionTooltip('run this workflow', 'execution:run'),
    },
  }
}
