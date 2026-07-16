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
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { useState } from 'react'

import { formatGracePeriodDuration } from './rotateDialogUtils'

type SecretRevealModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  identifier?: string
  clientSecret: string
  gracePeriodSeconds?: number
}

export function SecretRevealModal({
  isOpen,
  onClose,
  title,
  identifier,
  clientSecret,
  gracePeriodSeconds,
}: Readonly<SecretRevealModalProps>) {
  const [savedAck, setSavedAck] = useState(false)

  const handleClose = () => {
    setSavedAck(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} variant="medium">
      <ModalHeader title={title} />
      <ModalBody>
        <Stack hasGutter>
          <StackItem>
            <Alert variant="warning" isInline title="Save this secret now">
              The client secret will not be shown again. Copy and store it securely before closing this dialog.
            </Alert>
          </StackItem>

          {identifier && (
            <StackItem>
              <FormGroup label="Client ID" fieldId="secret-reveal-identifier">
                <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
                  {identifier}
                </ClipboardCopy>
              </FormGroup>
            </StackItem>
          )}

          <StackItem>
            <FormGroup label="Client secret" fieldId="secret-reveal-secret">
              <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
                {clientSecret}
              </ClipboardCopy>
            </FormGroup>
          </StackItem>

          {gracePeriodSeconds != null && (
            <StackItem>
              {gracePeriodSeconds > 0 ? (
                <Alert variant="info" isInline title="Grace period active">
                  The previous secret will remain valid for{' '}
                  <strong>{formatGracePeriodDuration(gracePeriodSeconds)}</strong> to allow zero-downtime rotation.
                </Alert>
              ) : (
                <Alert variant="warning" isInline title="Previous secret invalidated">
                  The previous secret has been immediately invalidated and is no longer valid. Any systems still using
                  it will need to be updated to the new secret now.
                </Alert>
              )}
            </StackItem>
          )}

          <StackItem>
            <Checkbox
              id="secret-reveal-saved-ack"
              label="I have saved the new secret"
              isChecked={savedAck}
              onChange={(_event, checked) => setSavedAck(checked)}
            />
          </StackItem>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" isDisabled={!savedAck} onClick={handleClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  )
}
