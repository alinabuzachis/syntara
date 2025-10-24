import { Scrollable } from '@ansible/nexus-ui-framework'
import clsx from 'clsx'
import { useContext, type ReactNode } from 'react'
import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeBody(props: { children: ReactNode; className?: string }) {
  const expandedState = useContext(NodeExpandedContext)
  const expanded = expandedState ? expandedState[0] : true
  if (!expanded) {
    return null
  }
  return (
    <div className={clsx('shrink overflow-hidden px-6', props.className)}>
      <Scrollable>{props.children}</Scrollable>
    </div>
  )
}
