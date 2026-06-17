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
  onConfirm: (note: string | null) => void
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

  // SECURITY: Notes are optional to match batch approval UX consistency
  // Audit trail is maintained via: approval status, decided_by, decided_at (always recorded)
  // Notes provide additional context but are not required for accountability
  const handleConfirm = () => {
    onConfirm(note.trim() || null)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="medium"
      aria-labelledby="bulk-reject-title"
      key={isOpen ? 'open' : 'closed'}
    >
      <ModalHeader
        title={`Reject ${approvalCount} approval step${approvalCount === 1 ? '' : 's'}`}
        labelId="bulk-reject-title"
        titleIconVariant="warning"
      />
      <ModalBody>
        <Stack hasGutter>
          <StackItem>
            <Content component={ContentVariants.p}>
              You are about to reject {approvalCount} approval step{approvalCount === 1 ? '' : 's'}.
            </Content>
          </StackItem>

          <StackItem>
            <FormGroup label="Rejection note" fieldId="rejection-note">
              <TextArea
                id="rejection-note"
                value={note}
                onChange={(_event, value) => setNote(value)}
                placeholder="Optional note for these rejections"
                rows={3}
                maxLength={1000}
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
          isDisabled={isLoading}
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
