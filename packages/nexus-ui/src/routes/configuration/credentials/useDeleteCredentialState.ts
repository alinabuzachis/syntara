import { useDialogState } from '../../../hooks/useDialogState'

import type { Credential, CredentialWorkflowRef } from './credentialConstants'
import { useCredentialWorkflowCheck } from './useCredentialWorkflowCheck'

type DeleteCredentialState = {
  credentialToDelete: Credential | null
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  isLoadingWorkflows: boolean
  openDeleteDialog: (credential: Credential) => void
  closeDeleteDialog: () => void
}

export function useDeleteCredentialState(): DeleteCredentialState {
  const dialog = useDialogState<Credential>()
  const { affectedWorkflows, workflowsFetchError, isLoadingWorkflows } = useCredentialWorkflowCheck(dialog.item)

  return {
    credentialToDelete: dialog.item,
    affectedWorkflows,
    workflowsFetchError,
    isLoadingWorkflows,
    openDeleteDialog: dialog.open,
    closeDeleteDialog: dialog.close,
  }
}
