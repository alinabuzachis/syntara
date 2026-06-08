import { permissionTooltip } from '../../../hooks/permissionUtils'
import { useCanI } from '../../../hooks/useCanI'

type IdentityProviderPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canTest: boolean
  canRevoke: boolean
  isLoading: boolean
  tooltips: {
    create: string
    update: string
    enable: string
    delete: string
    test: string
    editMapping: string
    revoke: string
  }
}

/**
 * Permission checks for identity provider management actions.
 *
 * Checks: identity-provider:create, identity-provider:update,
 * identity-provider:delete, identity-provider:test, admin:revocation:revoke.
 * All values default to `false` (safe-false) until the checks resolve.
 */
export function useIdentityProviderPermissions(): IdentityProviderPermissions {
  const resourceType = 'identity-provider' as const
  const { allowed: canCreate, isChecking: c1 } = useCanI('create', resourceType)
  const { allowed: canUpdate, isChecking: c2 } = useCanI('update', resourceType)
  const { allowed: canDelete, isChecking: c3 } = useCanI('delete', resourceType)
  const { allowed: canTest, isChecking: c4 } = useCanI('test', resourceType)
  const { allowed: canRevoke, isChecking: c5 } = useCanI('revoke', 'admin:revocation')

  const updatePermission = `${resourceType}:update` as const

  return {
    canCreate,
    canUpdate,
    canDelete,
    canTest,
    canRevoke,
    isLoading: c1 || c2 || c3 || c4 || c5,
    tooltips: {
      create: permissionTooltip('create an identity provider', `${resourceType}:create`),
      update: permissionTooltip('edit this identity provider', updatePermission),
      enable: permissionTooltip('enable or disable this identity provider', updatePermission),
      delete: permissionTooltip('delete this identity provider', `${resourceType}:delete`),
      test: permissionTooltip('test sign-in for this identity provider', `${resourceType}:test`),
      editMapping: permissionTooltip('edit group mapping', updatePermission),
      revoke: permissionTooltip('revoke tokens for this identity provider', 'admin:revocation:revoke'),
    },
  }
}
