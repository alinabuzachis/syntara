import {
  Button,
  Content,
  ContentVariants,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  TextArea,
} from '@patternfly/react-core'
import { RhUiDislikeIcon } from '@patternfly/react-icons'
import { useState } from 'react'

export type BulkRejectDialogProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: (note: string) => void
  approvalCount: number
  isLoading?: boolean
}

export function BulkRejectDialog({
  isOpen,
  onClose,
  onConfirm,
  approvalCount,
  isLoading = false,
}: Readonly<BulkRejectDialogProps>) {
  const [note, setNote] = useState('')

  const handleConfirm = () => {
    const trimmedNote = note.trim()
    if (!trimmedNote) {
      return // Don't submit if note is empty
    }
    onConfirm(trimmedNote)
  }

  const isValid = note.trim().length > 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="medium"
      aria-labelledby="bulk-reject-title"
      key={isOpen ? 'open' : 'closed'}
    >
      <ModalHeader
        title={`Reject ${approvalCount} step${approvalCount === 1 ? '' : 's'}`}
        labelId="bulk-reject-title"
        titleIconVariant="warning"
      />
      <ModalBody>
        <Stack hasGutter>
          <StackItem>
            <Content component={ContentVariants.p}>
              You are about to reject {approvalCount} step{approvalCount === 1 ? '' : 's'}.
            </Content>
          </StackItem>

          <StackItem>
            <FormGroup label="Rejection reason" fieldId="rejection-note" isRequired>
              <TextArea
                id="rejection-note"
                value={note}
                onChange={(_event, value) => setNote(value)}
                placeholder="Required: Explain why these approvals are being rejected"
                rows={3}
                maxLength={1000}
                isRequired
              />
            </FormGroup>
          </StackItem>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          icon={<RhUiDislikeIcon />}
          variant="danger"
          onClick={handleConfirm}
          isLoading={isLoading}
          isDisabled={isLoading || !isValid}
        >
          Reject
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isLoading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
