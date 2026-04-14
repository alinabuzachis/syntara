import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'

type ConfirmVariant = 'primary' | 'danger'

interface ConfirmationDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean
  /** Called when the dialog is closed (cancel or backdrop click) */
  onClose: () => void
  /** Called when the confirm button is clicked */
  onConfirm: () => void
  /** Dialog title */
  title: string
  /** Dialog body content */
  children: React.ReactNode
  /** Confirm button label (defaults to "Confirm") */
  confirmLabel?: string
  /** Cancel button label (defaults to "Cancel") */
  cancelLabel?: string
  /** Confirm button variant (defaults to "primary") */
  confirmVariant?: ConfirmVariant
  /** Modal size variant (defaults to "small") */
  variant?: 'small' | 'medium' | 'large'
  /** Optional title icon variant (e.g., "warning") */
  titleIconVariant?: 'warning' | 'danger'
  /** Optional aria-labelledby id */
  'aria-labelledby'?: string
  /** Optional aria-describedby id */
  'aria-describedby'?: string
}

/**
 * Reusable confirmation dialog for destructive or important actions.
 *
 * Replaces the repeated Modal + ModalHeader + ModalBody + ModalFooter pattern
 * found across delete/disable/validate/run confirmation dialogs.
 *
 * @example
 * ```tsx
 * <ConfirmationDialog
 *   isOpen={deleteDialogOpen}
 *   onClose={closeDialog}
 *   onConfirm={handleDelete}
 *   title="Delete user"
 *   confirmLabel="Delete"
 *   confirmVariant="danger"
 * >
 *   Are you sure you want to delete "{user.name}"? This action cannot be undone.
 * </ConfirmationDialog>
 * ```
 */
export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  variant = 'small',
  titleIconVariant,
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
}: Readonly<ConfirmationDialogProps>) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant={variant}
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
    >
      <ModalHeader title={title} titleIconVariant={titleIconVariant} labelId={ariaLabelledby} />
      <ModalBody id={ariaDescribedby}>{children}</ModalBody>
      <ModalFooter>
        <Button variant={confirmVariant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="link" onClick={onClose}>
          {cancelLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
