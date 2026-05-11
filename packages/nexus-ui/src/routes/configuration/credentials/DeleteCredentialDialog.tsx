import { Content, ContentVariants, Spinner } from '@patternfly/react-core'

import { ConfirmationDialog } from '../../../components/ConfirmationDialog'

import type { Credential, CredentialWorkflowRef } from './credentialConstants'
import { CredentialWorkflowWarning } from './CredentialWorkflowWarning'

type DeleteCredentialDialogProps = {
  credential: Credential | null
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  isLoadingWorkflows: boolean
  isLoading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DeleteCredentialDialog({
  credential,
  affectedWorkflows,
  workflowsFetchError,
  isLoadingWorkflows,
  isLoading,
  onConfirm,
  onClose,
}: Readonly<DeleteCredentialDialogProps>) {
  if (!credential) return null

  return (
    <ConfirmationDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete credential?"
      confirmLabel="Delete"
      confirmVariant="danger"
      titleIconVariant="warning"
      confirmLoading={isLoading || isLoadingWorkflows}
      destructiveAcknowledgement={{
        checkboxId: 'delete-credential-ack',
        label: 'I understand this credential will be permanently deleted.',
      }}
    >
      {isLoadingWorkflows ? (
        <Content component={ContentVariants.p}>
          <Spinner size="md" aria-label="Checking workflows" /> Checking for workflows that use this credential…
        </Content>
      ) : (
        <>
          <Content component={ContentVariants.p}>
            The credential <strong>{credential.name}</strong> will be deleted. This cannot be undone.
          </Content>
          <CredentialWorkflowWarning
            affectedWorkflows={affectedWorkflows}
            workflowsFetchError={workflowsFetchError}
            consequenceText="Deleting it will cause these workflows to fail:"
          />
        </>
      )}
    </ConfirmationDialog>
  )
}
