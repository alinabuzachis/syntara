import { Content, Flex, FlexItem } from '@patternfly/react-core'

import type { NodeMenuAction } from '../hooks/useNodeMenuActions'

import { NodeExpandToggle } from './NodeExpandToggle'
import { NodeHeader } from './NodeHeader'
import { NodeMenu } from './NodeMenu'
import { NodeTitle } from './NodeTitle'

interface StandardNodeHeaderProps {
  icon?: React.ReactNode
  title?: string
  subtitle?: string
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
    <>
      <NodeHeader>
        {props.icon && <FlexItem>{props.icon}</FlexItem>}
        <FlexItem>
          <Flex>
            {props.expandable && (
              <FlexItem>
                <NodeExpandToggle />
              </FlexItem>
            )}
            {props.menuActions && props.menuActions.length > 0 && (
              <FlexItem>
                <NodeMenu menuActions={props.menuActions} />
              </FlexItem>
            )}
          </Flex>
        </FlexItem>
      </NodeHeader>
      {(props.title || props.subtitle) && (
        <div
          style={{
            paddingTop: 'var(--pf-t--global--spacer--xs)',
            paddingLeft: 'var(--pf-t--global--spacer--md)',
            paddingRight: 'var(--pf-t--global--spacer--md)',
            paddingBottom: 'var(--pf-t--global--spacer--sm)',
          }}
        >
          <Content>
            <NodeTitle title={props.title ?? ''} subTitle={props.subtitle ?? ''} />
          </Content>
        </div>
      )}
    </>
  )
}
