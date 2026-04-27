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

interface DisableCredentialDialogProps {
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
    <Modal isOpen onClose={onClose} variant="small">
      <ModalHeader title="Disable credential?" titleIconVariant={RhUiWarningIcon} />
      <ModalBody>
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
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onConfirm} isDisabled={isLoadingWorkflows || isLoading} isLoading={isLoading}>
          Disable
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isLoading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
