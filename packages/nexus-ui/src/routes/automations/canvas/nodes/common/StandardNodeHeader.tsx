import { KebabMenuTrigger, Menu, MenuItem, MenuItems, MenuSeparator } from '@ansible/nexus-ui-framework'

import type { NodeMenuAction } from '../hooks/useNodeMenuActions'

import { NodeExpandToggle } from './NodeExpandToggle'
import { NodeHeader } from './NodeHeader'
import { NodeIcon } from './NodeIcon'
import { NodeTitle } from './NodeTitle'

interface StandardNodeHeaderProps {
  icon?: React.ReactNode
  title: string
  subtitle: string
  expandable?: boolean
  menuActions?: NodeMenuAction[]
}

/**
 * Standard node header component that combines icon, title, subtitle, optional expand toggle, and kebab menu.
 * Reduces boilerplate in node component implementations.
 *
 * The kebab menu supports:
 * - Custom actions via additionalActions prop in useNodeMenuActions
 * - Automatic separator before delete action when custom actions exist
 * - Danger styling for destructive actions (variant: 'danger')
 * - Icons for menu items
 *
 * Layout: Icon and kebab menu on first line, title and subtitle on second line below.
 */
export function StandardNodeHeader(props: Readonly<StandardNodeHeaderProps>) {
  return (
    <div className="relative">
      <NodeHeader>
        {props.icon && <NodeIcon>{props.icon}</NodeIcon>}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {props.expandable && <NodeExpandToggle />}
          {props.menuActions && props.menuActions.length > 0 && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Intentional for ReactFlow node interaction isolation
            <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className="nodrag nopan">
              <Menu>
                <KebabMenuTrigger label="Node actions menu" />
                <MenuItems>
                  {props.menuActions.map((action) => {
                    if (action.separator) {
                      return <MenuSeparator key={action.id} />
                    }
                    return (
                      <MenuItem
                        key={action.id}
                        onClick={() => {
                          action.onClick()
                        }}
                        className={action.variant === 'danger' ? 'menu-item-danger' : ''}
                      >
                        {action.icon && <span className="mr-2">{action.icon}</span>}
                        {action.label}
                      </MenuItem>
                    )
                  })}
                </MenuItems>
              </Menu>
            </div>
          )}
        </div>
      </NodeHeader>
      <div className="px-6 pt-2">
        <NodeTitle title={props.title} subTitle={props.subtitle} />
      </div>
    </div>
  )
}
