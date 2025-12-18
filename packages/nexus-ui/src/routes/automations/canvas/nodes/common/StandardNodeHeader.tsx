import { KebabMenuTrigger, Menu, MenuItem, MenuItems, MenuSeparator } from '@ansible/nexus-ui-framework'
import { Content, Flex, FlexItem } from '@patternfly/react-core'

import type { NodeMenuAction } from '../hooks/useNodeMenuActions'

import { NodeExpandToggle } from './NodeExpandToggle'
import { NodeHeader } from './NodeHeader'
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
    <div style={{ position: 'relative' }}>
      <NodeHeader>
        {props.icon && (
          <FlexItem style={{ marginLeft: 'var(--pf-t--global--spacer--sm)' }}>
            <div style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center' }}>{props.icon}</div>
          </FlexItem>
        )}
        <FlexItem style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            {props.expandable && (
              <FlexItem>
                <NodeExpandToggle />
              </FlexItem>
            )}
            {props.menuActions && props.menuActions.length > 0 && (
              <FlexItem>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                    }
                  }}
                  className="nodrag nopan"
                  role="button"
                  tabIndex={0}
                >
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
                            {action.icon && (
                              <span style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>{action.icon}</span>
                            )}
                            {action.label}
                          </MenuItem>
                        )
                      })}
                    </MenuItems>
                  </Menu>
                </div>
              </FlexItem>
            )}
          </Flex>
        </FlexItem>
      </NodeHeader>
      <Content
        style={{
          paddingLeft: 'var(--pf-t--global--spacer--sm)',
          paddingRight: 'var(--pf-t--global--spacer--sm)',
          paddingTop: 'var(--pf-t--global--spacer--xs)',
        }}
      >
        <NodeTitle title={props.title} subTitle={props.subtitle} />
      </Content>
    </div>
  )
}
