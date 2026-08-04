import { useCanI } from '../../../hooks/useCanI'

type CredentialDetailPermissions = {
  canReadWorkflows: boolean
  canReadIntegrations: boolean
  isLoading: boolean
}

/**
 * Permission checks for credential detail page tabs.
 */
export function useCredentialDetailPermissions(): CredentialDetailPermissions {
  const { allowed: canReadWorkflows, isChecking: isCheckingWorkflows } = useCanI('read', 'workflow')
  const { allowed: canReadIntegrations, isChecking: isCheckingIntegrations } = useCanI('read', 'integration')

  return {
    canReadWorkflows,
    canReadIntegrations,
    isLoading: isCheckingWorkflows || isCheckingIntegrations,
  }
}
