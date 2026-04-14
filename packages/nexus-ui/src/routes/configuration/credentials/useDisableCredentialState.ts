import { useCallback, useState } from 'react'

import { credentialsClient } from '../../../client'

import type { Credential, CredentialWorkflowRef } from './credentialConstants'

interface DisableCredentialState {
  credentialToDisable: Credential | null
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  openDisableDialog: (credential: Credential) => void
  closeDisableDialog: () => void
}

export function useDisableCredentialState(): DisableCredentialState {
  const [credentialToDisable, setCredentialToDisable] = useState<Credential | null>(null)

  const workflowsQuery = credentialsClient.useQuery(
    'get',
    '/credentials/{credential_id}/workflows',
    { params: { path: { credential_id: credentialToDisable?.id ?? '' } } },
    { enabled: !!credentialToDisable }
  )

  const affectedWorkflows: CredentialWorkflowRef[] = (workflowsQuery.data as CredentialWorkflowRef[] | undefined) ?? []
  const workflowsFetchError = !!workflowsQuery.error

  const openDisableDialog = useCallback((credential: Credential) => {
    setCredentialToDisable(credential)
  }, [])

  const closeDisableDialog = useCallback(() => {
    setCredentialToDisable(null)
  }, [])

  return {
    credentialToDisable,
    affectedWorkflows,
    workflowsFetchError,
    openDisableDialog,
    closeDisableDialog,
  }
}
