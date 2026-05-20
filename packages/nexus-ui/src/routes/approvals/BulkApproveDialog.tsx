import {
  Button,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  Content,
  ContentVariants,
  TextArea,
} from '@patternfly/react-core'
import { RhUiLikeIcon } from '@patternfly/react-icons'
import { useState } from 'react'

export type BulkApproveDialogProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: (note: string | null) => void
  approvalCount: number
  isLoading?: boolean
}

export function BulkApproveDialog({
  isOpen,
  onClose,
  onConfirm,
  approvalCount,
  isLoading = false,
}: Readonly<BulkApproveDialogProps>) {
  const [note, setNote] = useState('')

  const handleConfirm = () => {
    onConfirm(note.trim() || null)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="medium"
      aria-labelledby="bulk-approve-title"
      key={isOpen ? 'open' : 'closed'}
    >
      <ModalHeader
        title={`Approve ${approvalCount} step${approvalCount === 1 ? '' : 's'}`}
        labelId="bulk-approve-title"
      />
      <ModalBody>
        <Stack hasGutter>
          <StackItem>
            <Content component={ContentVariants.p}>
              You are about to approve {approvalCount} step{approvalCount === 1 ? '' : 's'}.
            </Content>
          </StackItem>

          <StackItem>
            <FormGroup label="Approval note" fieldId="approval-note">
              <TextArea
                id="approval-note"
                value={note}
                onChange={(_event, value) => setNote(value)}
                placeholder="Optional note for these approvals"
                rows={3}
                maxLength={1000}
              />
            </FormGroup>
          </StackItem>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          icon={<RhUiLikeIcon />}
          variant="primary"
          onClick={handleConfirm}
          isLoading={isLoading}
          isDisabled={isLoading}
        >
          Approve
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isLoading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
