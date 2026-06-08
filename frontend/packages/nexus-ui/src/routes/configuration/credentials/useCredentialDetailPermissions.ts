import { useCanI } from '../../../hooks/useCanI'

type CredentialDetailPermissions = {
  canReadWorkflows: boolean
  isLoading: boolean
}

/**
 * Permission checks for credential detail page tabs.
 */
export function useCredentialDetailPermissions(): CredentialDetailPermissions {
  const { allowed: canReadWorkflows, isChecking } = useCanI('read', 'workflow')

  return {
    canReadWorkflows,
    isLoading: isChecking,
  }
}
