import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'

import type { Credential } from './credentialConstants'

interface DeleteCredentialDialogProps {
  credential: Credential | null
  isLoading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DeleteCredentialDialog({
  credential,
  isLoading,
  onConfirm,
  onClose,
}: Readonly<DeleteCredentialDialogProps>) {
  if (!credential) return null

  return (
    <Modal isOpen onClose={onClose} variant="small">
      <ModalHeader title="Delete credential" />
      <ModalBody>
        Are you sure you want to delete &quot;{credential.name}&quot;? This action cannot be undone. Any workflows using
        this credential will fail.
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onConfirm} isDisabled={isLoading} isLoading={isLoading}>
          Delete
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isLoading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
