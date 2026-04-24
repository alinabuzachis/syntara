import {
  Button,
  Content,
  ContentVariants,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@patternfly/react-core'
import { RhUiWarningIcon } from '@patternfly/react-icons'

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
    <Modal isOpen onClose={onClose} variant="small">
      <ModalHeader title="Delete credential?" titleIconVariant={RhUiWarningIcon} />
      <ModalBody>
        {isLoadingWorkflows ? (
          <Content component={ContentVariants.p}>
            <Spinner size="md" aria-label="Checking workflows" /> Checking for workflows that use this credential…
          </Content>
        ) : (
          <>
            <Content component={ContentVariants.p}>
              Are you sure you want to delete &quot;{credential.name}&quot;? This action cannot be undone.
            </Content>
            <CredentialWorkflowWarning
              affectedWorkflows={affectedWorkflows}
              workflowsFetchError={workflowsFetchError}
              consequenceText="Deleting it will cause these workflows to fail:"
            />
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onConfirm} isDisabled={isLoadingWorkflows || isLoading} isLoading={isLoading}>
          Delete
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isLoading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
