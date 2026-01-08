import { StackItem } from '@patternfly/react-core'
import { useContext, useEffect, useRef, type ReactNode } from 'react'

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
 * - Scrollable content with max height constraint (200px)
 * - Prevents ReactFlow from capturing scroll/pan events using capture-phase listeners
 * - Uses PatternFly Stack/StackItem components for layout
 */
export function NodeBody(props: NodeBodyProps) {
  const expandedState = useContext(NodeExpandedContext)
  const expanded = expandedState !== null ? expandedState[0] : true
  const scrollableRef = useRef<HTMLDivElement>(null)

  // Prevent ReactFlow from capturing wheel events in capture phase
  // This must be done in capture phase to intercept before ReactFlow's handlers
  // Re-run effect when expanded state changes to ensure listeners are attached after re-expansion
  useEffect(() => {
    if (!expanded) return // Don't set up listeners when collapsed

    // Capture element reference at effect time for cleanup
    const element = scrollableRef.current
    if (!element) return

    const handleWheel = (e: WheelEvent) => {
      // Always stop propagation when wheel event is on the scrollable element
      // This allows the element to scroll instead of ReactFlow zooming
      e.stopPropagation()
    }

    // Use a small timeout to ensure the DOM element is fully rendered after re-expansion
    const timeoutId = setTimeout(() => {
      element.addEventListener('wheel', handleWheel, { capture: true })
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      // Use captured element reference for cleanup
      element.removeEventListener('wheel', handleWheel, { capture: true })
    }
  }, [expanded]) // Re-run when expanded state changes

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
      {/* Scrollable container*/}
      <div
        ref={scrollableRef}
        className={`nodrag nopan ${props.className || ''}`}
        style={{
          maxHeight: '200px',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingLeft: 'var(--pf-t--global--spacer--md)',
          paddingRight: 'var(--pf-t--global--spacer--md)',
          paddingBottom: 'var(--pf-t--global--spacer--md)',
        }}
        onWheel={(e) => {
          e.stopPropagation()
        }}
      >
        {props.children}
      </div>
    </StackItem>
  )
}
