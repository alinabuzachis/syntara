import { Menu as BaseMenu } from '@base-ui-components/react'
import clsx from 'clsx'

export function MenuItems({ children }: { children?: React.ReactNode }) {
  return (
    <BaseMenu.Portal>
      {/* <BaseMenu.Backdrop className="menu-backdrop" /> */}
      <BaseMenu.Positioner>
        <BaseMenu.Popup className={clsx('menu-items')}>{children}</BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}
