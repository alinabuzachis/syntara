import { Button, Content, ContentVariants, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { RhUiWarningIcon } from '@patternfly/react-icons'

import type { Credential, CredentialWorkflowRef } from './credentialConstants'

interface DisableCredentialDialogProps {
  credential: Credential | null
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  isLoading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DisableCredentialDialog({
  credential,
  affectedWorkflows,
  workflowsFetchError,
  isLoading,
  onConfirm,
  onClose,
}: Readonly<DisableCredentialDialogProps>) {
  if (!credential) return null

  return (
    <Modal isOpen onClose={onClose} variant="small">
      <ModalHeader title="Disable credential?" titleIconVariant={RhUiWarningIcon} />
      <ModalBody>
        <Content component={ContentVariants.p}>
          You are about to disable the following credential: <strong>{credential.name}</strong>
        </Content>
        {workflowsFetchError && (
          <Content
            component={ContentVariants.p}
            style={{ color: 'var(--pf-t--global--color--status--warning--default)' }}
          >
            Unable to check which workflows use this credential.
          </Content>
        )}
        {affectedWorkflows.length > 0 && (
          <>
            <Content component={ContentVariants.p}>
              {'This credential is currently used by '}
              <strong>
                {affectedWorkflows.length} workflow{affectedWorkflows.length === 1 ? '' : 's'}
              </strong>
              {':'}
            </Content>
            <Content component="ul">
              {affectedWorkflows.map((wf) => (
                <Content component="li" key={wf.id}>
                  {wf.name}
                </Content>
              ))}
            </Content>
          </>
        )}
        <Content component={ContentVariants.p}>
          Disabling this credential may cause these workflows to fail. You can re-enable the credential at any time.
        </Content>
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onConfirm} isDisabled={isLoading} isLoading={isLoading}>
          Disable
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isLoading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
