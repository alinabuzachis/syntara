import { Handle, type NodeProps, Position } from '@xyflow/react'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'

import { handleStyle } from './handleStyle'
import { NodeExpandedAllContext } from './NodeExpandedAllContext'
import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeComponent(props: {
  children: React.ReactNode
  disableSource?: boolean
  disableTarget?: boolean
  enableStart?: boolean
  enableEnd?: boolean
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
  return (
    <NodeExpandedContext.Provider value={expandedContext}>
      <div
        className={clsx(
          'glass card flex flex-col border-2 py-4',
          {
            'shadow-md shadow-black/50': !props.nodeProps.selected,
            'selected shadow-xl shadow-black/50': props.nodeProps.selected,
          },
          props.className
        )}
        onClick={props.onClick}
        onKeyDown={(e) => {
          if (props.onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            props.onClick(e as unknown as React.MouseEvent<HTMLDivElement, MouseEvent>)
          }
        }}
        role={props.onClick ? 'button' : undefined}
        tabIndex={props.onClick ? 0 : undefined}
      >
        {props.children}
        {!props.disableTarget && <Handle type="target" id="target" position={Position.Left} style={handleStyle} />}
        {!props.disableSource && <Handle type="source" id="source" position={Position.Right} style={handleStyle} />}
        {props.enableStart && (
          <Handle type="source" id="start" position={Position.Right} style={{ ...handleStyle, top: '85%' }} />
        )}
        {props.enableEnd && (
          <Handle type="target" id="end" position={Position.Left} style={{ ...handleStyle, top: '85%' }} />
        )}
      </div>
    </NodeExpandedContext.Provider>
  )
}
