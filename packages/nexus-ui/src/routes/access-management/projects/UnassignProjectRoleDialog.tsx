import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'

export interface ProjectRoleAssignment {
  id: string
  user_id: string
  username?: string
  project_id: string
  role_id: string
  role_name: string
  created_at?: string | null
}

export function UnassignProjectRoleDialog({
  assignment,
  isOpen,
  onClose,
  onConfirm,
}: Readonly<{
  assignment: ProjectRoleAssignment | null
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}>) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="small">
      <ModalHeader title="Unassign role" />
      <ModalBody>
        Are you sure you want to unassign role &quot;{assignment?.role_name}&quot; from{' '}
        {assignment?.username ?? assignment?.user_id}?
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onConfirm}>
          Unassign
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
