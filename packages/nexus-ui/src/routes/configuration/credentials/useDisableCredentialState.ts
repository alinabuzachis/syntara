import { useDialogState } from '../../../hooks/useDialogState'

import type { Credential, CredentialWorkflowRef } from './credentialConstants'
import { useCredentialWorkflowCheck } from './useCredentialWorkflowCheck'

interface DisableCredentialState {
  credentialToDisable: Credential | null
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  isLoadingWorkflows: boolean
  openDisableDialog: (credential: Credential) => void
  closeDisableDialog: () => void
}

export function useDisableCredentialState(): DisableCredentialState {
  const dialog = useDialogState<Credential>()
  const { affectedWorkflows, workflowsFetchError, isLoadingWorkflows } = useCredentialWorkflowCheck(dialog.item)

  return {
    credentialToDisable: dialog.item,
    affectedWorkflows,
    workflowsFetchError,
    isLoadingWorkflows,
    openDisableDialog: dialog.open,
    closeDisableDialog: dialog.close,
  }
}
