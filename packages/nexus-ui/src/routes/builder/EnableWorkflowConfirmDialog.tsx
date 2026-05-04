import { ConfirmationDialog } from '../../components/ConfirmationDialog'

type EnableWorkflowConfirmDialogProps = Readonly<{
  isOpen: boolean
  pendingEnableState: boolean | null
  isSaving: boolean
  workflowName: string
  onClose: () => void
  onConfirm: () => Promise<void>
}>

/**
 * Confirmation dialog shown when toggling enable/disable with unsaved changes.
 * Prompts user to save before applying the toggle.
 */
export function EnableWorkflowConfirmDialog({
  isOpen,
  pendingEnableState,
  isSaving,
  workflowName,
  onClose,
  onConfirm,
}: EnableWorkflowConfirmDialogProps) {
  if (pendingEnableState === null) {
    return null
  }

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Save changes to "${workflowName}" before ${pendingEnableState ? 'enabling' : 'disabling'}?`}
      confirmLabel="Save and continue"
      confirmLoading={isSaving}
    >
      You have unsaved changes. Do you want to save them before {pendingEnableState ? 'enabling' : 'disabling'}?
    </ConfirmationDialog>
  )
}
