import { Divider, Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core'
import type { MenuToggleElement, TooltipProps } from '@patternfly/react-core'
import { RhUiEllipsisVerticalFillIcon } from '@patternfly/react-icons'
import { useCallback, useState } from 'react'

export type KebabAction = {
  /** Unique identifier for this action, used as the React `key`. */
  key: string
  /** Label content rendered inside the dropdown item. Omit for separators. */
  title?: React.ReactNode
  /** Callback fired when the item is clicked (ignored when `isAriaDisabled`). */
  onClick?: () => void
  /** Render a visual divider instead of a clickable item. */
  isSeparator?: boolean
  /** Apply danger styling (red text). Automatically suppressed when `isAriaDisabled`. */
  isDanger?: boolean
  /** Fully disable the item (removes it from the tab order). */
  isDisabled?: boolean
  /** Visually disable the item while keeping it focusable for assistive technology. */
  isAriaDisabled?: boolean
  /** Tooltip shown on hover — typically used to explain why the item is disabled. */
  tooltipProps?: TooltipProps
}

type NxKebabMenuProps = Readonly<{
  actions: KebabAction[]
  /** Accessible label for the toggle button — must be unique per context (e.g. per table row). */
  'aria-label': string
}>

function KebabToggle({
  toggleRef,
  isExpanded,
  ariaLabel,
  onToggle,
}: Readonly<{
  toggleRef: React.Ref<MenuToggleElement>
  isExpanded: boolean
  ariaLabel: string
  onToggle: () => void
}>) {
  return (
    <MenuToggle ref={toggleRef} variant="plain" onClick={onToggle} isExpanded={isExpanded} aria-label={ariaLabel}>
      <RhUiEllipsisVerticalFillIcon />
    </MenuToggle>
  )
}

export function NxKebabMenu({ actions, 'aria-label': ariaLabel }: NxKebabMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const renderToggle = useCallback(
    (toggleRef: React.Ref<MenuToggleElement>) => (
      <KebabToggle
        toggleRef={toggleRef}
        isExpanded={isOpen}
        ariaLabel={ariaLabel}
        onToggle={() => setIsOpen((prev) => !prev)}
      />
    ),
    [isOpen, ariaLabel]
  )

  return (
    <Dropdown isOpen={isOpen} onOpenChange={setIsOpen} popperProps={{ position: 'end' }} toggle={renderToggle}>
      <DropdownList>
        {actions.map((action) => {
          if (action.isSeparator) {
            return <Divider key={action.key} />
          }
          return (
            <DropdownItem
              key={action.key}
              isDanger={action.isDanger && !action.isAriaDisabled}
              isDisabled={action.isDisabled}
              isAriaDisabled={action.isAriaDisabled}
              tooltipProps={action.tooltipProps}
              onClick={() => {
                if (action.isAriaDisabled) return
                action.onClick?.()
                setIsOpen(false)
              }}
            >
              {action.title}
            </DropdownItem>
          )
        })}
      </DropdownList>
    </Dropdown>
  )
}
