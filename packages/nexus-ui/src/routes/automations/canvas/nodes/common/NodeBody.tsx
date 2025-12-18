import { Collapsible, Scrollable } from '@ansible/nexus-ui-framework'
import { useContext, type ReactNode } from 'react'

import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeBody(props: { children: ReactNode; className?: string }) {
  const expandedState = useContext(NodeExpandedContext)
  const expanded = expandedState ? expandedState[0] : true
  return (
    <Collapsible collapsed={!expanded}>
      <div
        style={{
          padding: 'var(--pf-t--global--spacer--sm)',
        }}
      >
        <Scrollable className={props.className}>{props.children}</Scrollable>
      </div>
    </Collapsible>
  )
}
