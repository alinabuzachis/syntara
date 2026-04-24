import { credentialsClient } from '../../../client'

import type { Credential, CredentialWorkflowRef } from './credentialConstants'

type CredentialWorkflowCheck = {
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  isLoadingWorkflows: boolean
}

export function useCredentialWorkflowCheck(credential: Credential | null): CredentialWorkflowCheck {
  const workflowsQuery = credentialsClient.useQuery(
    'get',
    '/credentials/{credential_id}/workflows',
    { params: { path: { credential_id: credential?.id ?? '' } } },
    { enabled: !!credential }
  )

  return {
    affectedWorkflows: workflowsQuery.data ?? [],
    workflowsFetchError: !!workflowsQuery.error,
    isLoadingWorkflows: workflowsQuery.isLoading && !!credential,
  }
}
