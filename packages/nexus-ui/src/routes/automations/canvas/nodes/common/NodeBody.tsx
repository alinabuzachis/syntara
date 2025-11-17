import { Collapsible, Scrollable } from '@ansible/nexus-ui-framework'
import { useContext, type ReactNode } from 'react'

import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeBody(props: { children: ReactNode; className?: string }) {
  const expandedState = useContext(NodeExpandedContext)
  const expanded = expandedState ? expandedState[0] : true
  return (
    <Collapsible collapsed={!expanded}>
      <Scrollable className="px-6 pt-4">{props.children}</Scrollable>
    </Collapsible>
  )
}
