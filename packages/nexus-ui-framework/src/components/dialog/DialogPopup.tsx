import { Dialog as BaseDialog } from '@base-ui-components/react'
import type { ReactNode } from 'react'
import clsx from 'clsx'

export function DialogPopup({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Popup
        className={clsx(
          'glass fixed top-1/2 left-1/2 z-50 min-w-96 -translate-x-1/2 -translate-y-1/2',
          'rounded-2xl border-2 border-violet-300/20 p-6 shadow-2xl',
          'flex flex-col gap-4',
          className
        )}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
}
