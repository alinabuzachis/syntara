import {
  Alert,
  Button,
  Checkbox,
  ClipboardCopy,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core'
import { useState } from 'react'

import styles from './SecretRevealModal.module.css'

type SecretRevealModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  identifier: string
  clientSecret: string
}

export function SecretRevealModal({
  isOpen,
  onClose,
  title,
  identifier,
  clientSecret,
}: Readonly<SecretRevealModalProps>) {
  const [savedAck, setSavedAck] = useState(false)

  const handleClose = () => {
    setSavedAck(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="medium">
      <ModalHeader title={title} />
      <ModalBody>
        <Alert variant="warning" isInline title="Save these credentials now">
          The client secret will not be shown again. Store it securely before closing this dialog.
        </Alert>

        <FormGroup label="Client ID" fieldId="secret-reveal-identifier" className={styles.field}>
          <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
            {identifier}
          </ClipboardCopy>
        </FormGroup>

        <FormGroup label="Client secret" fieldId="secret-reveal-secret" className={styles.field}>
          <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
            {clientSecret}
          </ClipboardCopy>
        </FormGroup>

        <Checkbox
          id="secret-reveal-saved-ack"
          label="I have saved the credentials"
          isChecked={savedAck}
          onChange={(_event, checked) => setSavedAck(checked)}
          className={styles.checkbox}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" isDisabled={!savedAck} onClick={handleClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  )
}
