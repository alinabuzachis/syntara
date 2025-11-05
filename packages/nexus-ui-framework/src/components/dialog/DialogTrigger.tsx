import { Dialog as BaseDialog } from '@base-ui-components/react'
import type { ReactNode } from 'react'

export function DialogTrigger({ children, className }: { children?: ReactNode; className?: string }) {
  return <BaseDialog.Trigger className={className}>{children}</BaseDialog.Trigger>
}
