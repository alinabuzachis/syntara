import { Divider, Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core'
import type { DropdownProps, MenuToggleElement } from '@patternfly/react-core'
import { RhUiEllipsisVerticalFillIcon } from '@patternfly/react-icons'
import { useState } from 'react'

import type { NodeMenuAction } from '../hooks/useNodeMenuActions'

interface NodeMenuProps {
  menuActions: NodeMenuAction[]
  className?: string
  style?: React.CSSProperties
  /**
   * Passed directly to the PatternFly Dropdown's Popper.
   * `preventOverflow` defaults to `true` so the menu shifts to stay inside the
   * viewport rather than causing a horizontal scrollbar when the node is near
   * the canvas edge.  Pass `{ position: 'right' }` to additionally pin the menu
   * to the right edge of the toggle (opens leftward).
   */
  popperProps?: DropdownProps['popperProps']
}

/**
 * Shared component for node action menus (kebab menu).
 * Handles PatternFly Dropdown with proper event propagation prevention
 * to avoid triggering node click handlers.
 */
export function NodeMenu(props: Readonly<NodeMenuProps>) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  if (props.menuActions.length === 0) {
    return null
  }

  return (
    <div
      data-testid="node-menu-wrapper"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation()
        }
      }}
      className={`nodrag nopan ${props.className ?? ''}`}
      role="button"
      tabIndex={0}
      style={props.style}
    >
      <Dropdown
        isOpen={isMenuOpen}
        onOpenChange={(isOpen) => setIsMenuOpen(isOpen)}
        popperProps={{ preventOverflow: true, ...props.popperProps }}
        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            variant="plain"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            isExpanded={isMenuOpen}
            aria-label="Node actions menu"
            className="nodrag nopan"
          >
            <RhUiEllipsisVerticalFillIcon />
          </MenuToggle>
        )}
      >
        <DropdownList>
          {props.menuActions.map((action) => {
            if (action.separator) {
              return <Divider key={action.id} />
            }
            return (
              <DropdownItem
                data-testid={`node-menu-item-${action.id}`}
                key={action.id}
                onClick={() => {
                  action.onClick()
                  setIsMenuOpen(false)
                }}
                isDanger={action.variant === 'danger'}
              >
                {action.icon && <span style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>{action.icon}</span>}
                {action.label}
              </DropdownItem>
            )
          })}
        </DropdownList>
      </Dropdown>
    </div>
  )
}
