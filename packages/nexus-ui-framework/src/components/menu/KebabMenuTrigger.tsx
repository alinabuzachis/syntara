import { Menu as BaseMenu } from '@base-ui-components/react'
import clsx from 'clsx'
import { EllipsisVerticalIcon } from 'lucide-react'

interface KebabMenuTriggerProps {
  /**
   * Accessible label for the menu trigger button.
   * @default 'Actions menu'
   */
  label?: string
  /**
   * Additional CSS classes to apply to the trigger.
   */
  className?: string
}

/**
 * A pre-styled kebab (vertical ellipsis) menu trigger button.
 * Use within a Menu component to open a dropdown menu.
 *
 * @example
 * <Menu>
 *   <KebabMenuTrigger label="Row actions" />
 *   <MenuItems>
 *     <MenuItem>Edit</MenuItem>
 *     <MenuItem>Delete</MenuItem>
 *   </MenuItems>
 * </Menu>
 */
export function KebabMenuTrigger({ label = 'Actions menu', className }: Readonly<KebabMenuTriggerProps>) {
  return (
    <BaseMenu.Trigger
      className={clsx(
        'flex size-6 items-center justify-center rounded text-white/60 transition-all duration-150',
        'hover:bg-white/15 hover:text-white',
        'data-[popup-open]:bg-white/15 data-[popup-open]:text-white',
        className
      )}
      aria-label={label}
    >
      <EllipsisVerticalIcon className="size-4" />
    </BaseMenu.Trigger>
  )
}
