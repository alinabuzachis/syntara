import { Dialog as BaseDialog } from '@base-ui-components/react'

export function DialogBackdrop({ className }: { className?: string }) {
  return <BaseDialog.Backdrop className={className} />
}
