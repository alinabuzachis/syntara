import { Button, Content, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { useCallback, useState } from 'react'

type SaveBeforeViewDialogProps = Readonly<{
  isOpen: boolean
  onSave: () => Promise<boolean>
  onViewWithoutSaving: () => void
  onCancel: () => void
}>

export function SaveBeforeViewDialog({ isOpen, onSave, onViewWithoutSaving, onCancel }: SaveBeforeViewDialogProps) {
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      await onSave()
    } finally {
      setIsSaving(false)
    }
  }, [onSave])

  return (
    <Modal isOpen={isOpen} onClose={onCancel} variant="small">
      <ModalHeader title="Save changes before viewing this version?" />
      <ModalBody>
        <Content>
          Viewing workflow versions will exit the editor view and will permanently delete all recent unsaved progress on
          your workflow. Please save your work before leaving.
        </Content>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handleSave} isLoading={isSaving} isDisabled={isSaving}>
          Save workflow
        </Button>
        <Button variant="secondary" onClick={onViewWithoutSaving} isDisabled={isSaving}>
          View version without saving
        </Button>
        <Button variant="link" onClick={onCancel} isDisabled={isSaving}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
