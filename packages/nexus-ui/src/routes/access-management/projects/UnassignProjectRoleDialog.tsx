import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import type { ProjectRoleAssignmentRead } from '../../access/types'

export function UnassignProjectRoleDialog({
  assignment,
  isOpen,
  onClose,
  onConfirm,
}: Readonly<{
  assignment: ProjectRoleAssignmentRead | null
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}>) {
  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Unassign role"
      confirmLabel="Unassign"
      confirmVariant="danger"
    >
      Are you sure you want to unassign role &quot;{assignment?.role_name}&quot; from{' '}
      {assignment?.username ?? assignment?.user_id}?
    </ConfirmationDialog>
  )
}
