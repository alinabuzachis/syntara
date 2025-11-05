import { Dialog as BaseDialog } from '@base-ui-components/react'
import type { ReactNode } from 'react'

export function DialogDescription({ children }: { children?: ReactNode }) {
  return <BaseDialog.Description className="text-sm text-white/70">{children}</BaseDialog.Description>
}
