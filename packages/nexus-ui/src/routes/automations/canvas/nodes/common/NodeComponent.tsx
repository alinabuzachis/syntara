import { CompassPanel } from '@ansible/nexus-ui-framework'
import { Handle, type NodeProps, Position } from '@xyflow/react'
import React, { useEffect, useState } from 'react'

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
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
  nodeProps: NodeProps
}) {
  const { expandAllEvent, collapseAllEvent } = React.useContext(NodeExpandedAllContext)
  const expandedContext = useState(true)
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
  const isSelected = props.nodeProps.selected

  return (
    <NodeExpandedContext.Provider value={expandedContext}>
      <CompassPanel
        hasNoPadding
        className={props.className}
        onClick={props.onClick}
        style={{
          overflow: 'hidden', // Clip handles to create semicircle effect
          cursor: props.onClick ? 'pointer' : undefined,
          ...(isSelected && {
            border: '2px solid var(--pf-t--global--color--brand--default)',
          }),
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
