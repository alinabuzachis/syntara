import { Content, ContentVariants, Spinner } from '@patternfly/react-core'

import { ConfirmationDialog } from '../../../components/ConfirmationDialog'

import type { Credential, CredentialWorkflowRef } from './credentialConstants'
import { CredentialWorkflowWarning } from './CredentialWorkflowWarning'

type DisableCredentialDialogProps = {
  credential: Credential | null
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  isLoadingWorkflows: boolean
  isLoading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DisableCredentialDialog({
  credential,
  affectedWorkflows,
  workflowsFetchError,
  isLoadingWorkflows,
  isLoading,
  onConfirm,
  onClose,
}: Readonly<DisableCredentialDialogProps>) {
  if (!credential) return null

  return (
    <ConfirmationDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      title="Disable credential?"
      confirmLabel="Disable"
      confirmVariant="primary"
      confirmLoading={isLoadingWorkflows || isLoading}
    >
      {isLoadingWorkflows ? (
        <Content component={ContentVariants.p}>
          <Spinner size="md" aria-label="Checking workflows" /> Checking for workflows that use this credential…
        </Content>
      ) : (
        <>
          <Content component={ContentVariants.p}>
            You are about to disable the following credential: <strong>{credential.name}</strong>
          </Content>
          <CredentialWorkflowWarning
            affectedWorkflows={affectedWorkflows}
            workflowsFetchError={workflowsFetchError}
            consequenceText="Disabling it will cause these workflows to fail:"
          />
          {!workflowsFetchError && (
            <Content component={ContentVariants.p}>You can re-enable the credential at any time.</Content>
          )}
        </>
      )}
    </ConfirmationDialog>
  )
}
