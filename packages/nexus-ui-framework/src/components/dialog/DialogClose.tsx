import { Dialog as BaseDialog } from '@base-ui-components/react'
import type { ReactNode } from 'react'

export function DialogClose({ children, className }: { children?: ReactNode; className?: string }) {
  return <BaseDialog.Close className={className}>{children}</BaseDialog.Close>
}
