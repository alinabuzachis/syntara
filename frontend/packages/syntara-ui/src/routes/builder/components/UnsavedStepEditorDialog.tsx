import { Button, Content, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'

type UnsavedStepEditorDialogProps = Readonly<{
  isOpen: boolean
  onClose: () => void
}>

export function UnsavedStepEditorDialog({ isOpen, onClose }: UnsavedStepEditorDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="small">
      <ModalHeader title="Unsaved step changes" titleIconVariant="warning" />
      <ModalBody>
        <Content component="p">
          You have unsaved changes in the step editor. Save or cancel your step changes before saving the workflow.
        </Content>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onClose}>
          Return to editor
        </Button>
      </ModalFooter>
    </Modal>
  )
}
