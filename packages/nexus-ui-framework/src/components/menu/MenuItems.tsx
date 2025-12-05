import { Menu as BaseMenu } from '@base-ui-components/react'
import clsx from 'clsx'

interface MenuItemsProps {
  children?: React.ReactNode
  /**
   * The side of the trigger to position the menu.
   * @default 'bottom'
   */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /**
   * The alignment of the menu relative to the trigger.
   * @default 'end'
   */
  align?: 'start' | 'center' | 'end'
  /**
   * The offset from the trigger edge in pixels.
   * @default 4
   */
  sideOffset?: number
}

export function MenuItems({ children, side = 'bottom', align = 'end', sideOffset = 4 }: Readonly<MenuItemsProps>) {
  return (
    <BaseMenu.Portal>
      {/* <BaseMenu.Backdrop className="menu-backdrop" /> */}
      <BaseMenu.Positioner side={side} align={align} sideOffset={sideOffset}>
        <BaseMenu.Popup className={clsx('menu-items')}>{children}</BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}
