import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'
import React, { useState } from 'react'
import { handleStyle } from './handleStyle'
import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeComponent(props: {
  children: React.ReactNode
  disableSource?: boolean
  disableTarget?: boolean
  enableStart?: boolean
  enableEnd?: boolean
  className?: string
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
}) {
  const expandedContext = useState(true)
  return (
    <NodeExpandedContext.Provider value={expandedContext}>
      <div
        className={clsx('glass card flex flex-col gap-4 border-2 px-6 py-4 shadow-md shadow-black/50', props.className)}
        onClick={props.onClick}
      >
        {props.children}
        {!props.disableTarget && <Handle type="target" id="target" position={Position.Left} style={handleStyle} />}
        {!props.disableSource && <Handle type="source" id="source" position={Position.Right} style={handleStyle} />}
        {props.enableStart && (
          <Handle type="source" id="start" position={Position.Left} style={{ ...handleStyle, top: '85%' }} />
        )}
        {props.enableEnd && (
          <Handle type="target" id="end" position={Position.Right} style={{ ...handleStyle, top: '85%' }} />
        )}
      </div>
    </NodeExpandedContext.Provider>
  )
}

export function NodeBody(props: { children: React.ReactNode; className?: string }) {
  const [expanded] = React.useContext(NodeExpandedContext)
  if (!expanded) {
    return null
  }
  return props.children
}
