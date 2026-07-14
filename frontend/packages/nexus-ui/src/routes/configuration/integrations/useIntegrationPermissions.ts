import { permissionTooltip, useResourceCrudPermissions } from '../../../hooks/permissionUtils'

export type IntegrationPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  isLoading: boolean
  tooltips: {
    create: string
    update: string
    enable: string
    validate: string
    delete: string
  }
}

/**
 * Permission checks for integration page actions.
 *
 * Checks: integration:create, integration:update, integration:delete.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useIntegrationPermissions(): IntegrationPermissions {
  const resourceType = 'integration'
  const { canCreate, canUpdate, canDelete, isLoading } = useResourceCrudPermissions(resourceType)
  const updatePermission = `${resourceType}:update`

  return {
    canCreate,
    canUpdate,
    canDelete,
    isLoading,
    tooltips: {
      create: permissionTooltip('configure an integration', `${resourceType}:create`),
      update: permissionTooltip('edit this integration', updatePermission),
      enable: permissionTooltip('enable or disable this integration', updatePermission),
      validate: permissionTooltip('validate this integration', updatePermission),
      delete: permissionTooltip('delete this integration', `${resourceType}:delete`),
    },
  }
}
