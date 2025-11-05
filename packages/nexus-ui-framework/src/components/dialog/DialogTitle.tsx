import { Dialog as BaseDialog } from '@base-ui-components/react'
import type { ReactNode } from 'react'

export function DialogTitle({ children }: { children?: ReactNode }) {
  return <BaseDialog.Title className="text-xl font-semibold">{children}</BaseDialog.Title>
}
