import { CompassPanel } from '@patternfly/react-core'
import { Handle, type NodeProps, Position, useReactFlow } from '@xyflow/react'
import React, { useEffect, useRef, useState } from 'react'

import { targetHandleStyle, sourceHandleStyle } from './handleStyle'
import { NodeExpandedAllContext } from './NodeExpandedAllContext'
import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeComponent(props: {
  children: React.ReactNode
  disableSource?: boolean
  disableTarget?: boolean
  enableStart?: boolean
  enableEnd?: boolean
  reverseHandles?: boolean
  className?: string
  style?: React.CSSProperties
  hasDashedBorder?: boolean
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
  nodeProps: NodeProps
}) {
  const { expandAllEvent, collapseAllEvent } = React.useContext(NodeExpandedAllContext)
  const expandedContext = useState(true)
  const nodeRef = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useReactFlow()

  useEffect(() => {
    const expandListener = () => {
      expandedContext[1](true)
    }
    const collapseListener = () => {
      expandedContext[1](false)
    }
    expandAllEvent.addEventListener('expandAll', expandListener)
    collapseAllEvent.addEventListener('collapseAll', collapseListener)
    return () => {
      expandAllEvent.removeEventListener('expandAll', expandListener)
      collapseAllEvent.removeEventListener('collapseAll', collapseListener)
    }
  }, [expandAllEvent, collapseAllEvent, expandedContext])

  // Auto-resize node based on content width
  useEffect(() => {
    if (!nodeRef.current) return

    // Use ResizeObserver to detect when content size changes
    const resizeObserver = new ResizeObserver(() => {
      // Measure the actual content width and update the node
      const width = nodeRef.current?.scrollWidth
      if (width && width > 0) {
        const node = reactFlowInstance.getNode(props.nodeProps.id)
        if (node && node.width !== width) {
          reactFlowInstance.updateNode(props.nodeProps.id, { width })
        }
      }
    })

    resizeObserver.observe(nodeRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [expandedContext[0], props.nodeProps.id, reactFlowInstance])

  const isSelected = props.nodeProps.selected

  return (
    <NodeExpandedContext.Provider value={expandedContext}>
      <CompassPanel
        ref={nodeRef}
        hasNoPadding
        className={props.className}
        onClick={props.onClick}
        style={{
          overflow: 'hidden', // Clip handles to create semicircle effect
          cursor: props.onClick || props.hasDashedBorder ? 'pointer' : undefined,
          width: 'max-content', // Allow node to size based on content
          minWidth: props.nodeProps.type === 'trigger' ? '180px' : '240px', // Minimum width for consistency
          maxWidth: '600px', // Maximum width to prevent nodes from becoming too wide
          // Apply dashed border styling for placeholder nodes
          ...(props.hasDashedBorder && {
            border: '2px dashed rgba(196, 181, 253, 0.5)',
            // Explicitly set individual properties to override any CompassPanel defaults
            borderWidth: '2px',
            borderStyle: 'dashed',
            borderColor: 'rgba(196, 181, 253, 0.5)',
          }),
          // Apply selected border only if not a dashed border placeholder
          ...(isSelected &&
            !props.hasDashedBorder && {
              border: '2px solid var(--pf-t--global--color--brand--default)',
            }),
          // Apply selected + dashed border
          ...(isSelected &&
            props.hasDashedBorder && {
              border: '2px dashed var(--pf-t--global--color--brand--default)',
            }),
          ...props.style, // Merge with custom styles (will override borders if specified)
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (props.onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            props.onClick(e as unknown as React.MouseEvent<HTMLDivElement, MouseEvent>)
          }
        }}
        role={props.onClick ? 'button' : undefined}
        tabIndex={props.onClick ? 0 : undefined}
      >
        {props.children}
        {!props.disableTarget && (
          <Handle
            type="target"
            id="target"
            position={props.reverseHandles ? Position.Right : Position.Left}
            style={targetHandleStyle}
          />
        )}
        {!props.disableSource && (
          <Handle
            type="source"
            id="source"
            position={props.reverseHandles ? Position.Left : Position.Right}
            style={sourceHandleStyle}
          />
        )}
        {props.enableStart && (
          <Handle type="source" id="start" position={Position.Right} style={{ ...sourceHandleStyle, top: '85%' }} />
        )}
        {props.enableEnd && (
          <Handle
            type="target"
            id="end"
            position={Position.Left}
            style={{
              ...targetHandleStyle,
              top: '50%', // Same position as main target handle
              opacity: 0, // Invisible
              pointerEvents: 'none', // Non-interactive
            }}
          />
        )}
      </CompassPanel>
    </NodeExpandedContext.Provider>
  )
}
