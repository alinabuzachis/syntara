import { Button, Checkbox, Modal, ModalBody, ModalFooter, ModalHeader, Stack, StackItem } from '@patternfly/react-core'
import { useState, type ReactNode } from 'react'

type ConfirmVariant = 'primary' | 'danger'

/** When set, the user must check the box before the confirm action is enabled. */
export type DestructiveAcknowledgementProps = {
  /** Stable id for the checkbox (labels and tests). */
  checkboxId: string
  /** Checkbox label (e.g. "I understand this cannot be undone"). */
  label: ReactNode
}

type ConfirmationDialogProps = {
  /** Whether the dialog is open */
  isOpen: boolean
  /** Called when the dialog is closed (cancel or backdrop click) */
  onClose: () => void
  /** Called when the confirm button is clicked */
  onConfirm: () => void
  /** Dialog title */
  title: string
  /** Dialog body content */
  children: ReactNode
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
  /**
   * Optional extra confirmation for irreversible actions. The confirm button stays
   * disabled until the checkbox is checked; state resets whenever the dialog opens.
   */
  destructiveAcknowledgement?: DestructiveAcknowledgementProps
  /** When true, confirm shows a spinner and both footer actions are disabled */
  confirmLoading?: boolean
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
 *   title="Delete user?"
 *   confirmLabel="Delete"
 *   confirmVariant="danger"
 *   titleIconVariant="warning"
 *   destructiveAcknowledgement={{
 *     checkboxId: 'delete-user-ack',
 *     label: 'I understand this cannot be undone.',
 *   }}
 * >
 *   <Content component="p">
 *     The user <strong>{user.name}</strong> will be deleted. This cannot be undone.
 *   </Content>
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
  destructiveAcknowledgement,
  confirmLoading = false,
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
}: Readonly<ConfirmationDialogProps>) {
  const [destructiveAcknowledged, setDestructiveAcknowledged] = useState(false)

  // Reset acknowledgement state when the dialog is not visible, so reopening starts clean.
  if (!isOpen && destructiveAcknowledged) {
    setDestructiveAcknowledged(false)
  }

  const confirmDisabled = Boolean(destructiveAcknowledgement) && !destructiveAcknowledged

  const body = destructiveAcknowledgement ? (
    <Stack hasGutter>
      <StackItem>{children}</StackItem>
      <StackItem>
        <Checkbox
          id={destructiveAcknowledgement.checkboxId}
          label={destructiveAcknowledgement.label}
          isChecked={destructiveAcknowledged}
          onChange={(_event, checked) => {
            setDestructiveAcknowledged(checked)
          }}
        />
      </StackItem>
    </Stack>
  ) : (
    children
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant={variant}
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
    >
      <ModalHeader title={title} titleIconVariant={titleIconVariant} labelId={ariaLabelledby} />
      <ModalBody id={ariaDescribedby}>{body}</ModalBody>
      <ModalFooter>
        <Button
          variant={confirmVariant}
          onClick={onConfirm}
          isDisabled={confirmDisabled || confirmLoading}
          isLoading={confirmLoading}
        >
          {confirmLabel}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={confirmLoading}>
          {cancelLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
