import { StackItem } from '@patternfly/react-core'
import { useContext, type ReactNode } from 'react'

import { NodeExpandedContext } from './NodeExpandedContext'

export interface NodeBodyProps {
  children: ReactNode
  className?: string
}

/**
 * Collapsible, scrollable content area for workflow nodes.
 *
 * Features:
 * - Expands/collapses based on NodeExpandedContext
 * - Expands/collapses based on NodeExpandedContext
 * - Uses PatternFly Stack/StackItem components for layout
 */
export function NodeBody(props: NodeBodyProps) {
  const expandedState = useContext(NodeExpandedContext)
  const expanded = expandedState !== null ? expandedState[0] : true

  if (!expanded) {
    return null
  }

  return (
    <StackItem
      className="nodrag nopan"
      style={{
        cursor: 'default', // Override node's draggable cursor - this area is scrollable, not draggable
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Content container */}
      <div
        className={`nodrag nopan ${props.className || ''}`}
        style={{
          paddingLeft: 'var(--pf-t--global--spacer--md)',
          paddingRight: 'var(--pf-t--global--spacer--md)',
          paddingBottom: 'var(--pf-t--global--spacer--md)',
        }}
      >
        {props.children}
      </div>
    </StackItem>
  )
}
