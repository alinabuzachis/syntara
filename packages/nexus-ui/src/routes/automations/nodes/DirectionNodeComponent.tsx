import { Handle, Position } from '@xyflow/react'
import { useContext } from 'react'
import { FlowDirectionContext } from '../FlowDirectionContext'

export function DirectionNodeComponent(props: { children: React.ReactNode }) {
  const [flowDirection] = useContext(FlowDirectionContext)

  return (
    <>
      {props.children}
      <Handle type="target" id="top" position={Position.Top} style={{ opacity: flowDirection === 'TB' ? 1 : 0 }} />
      <Handle type="target" id="left" position={Position.Left} style={{ opacity: flowDirection === 'LR' ? 1 : 0 }} />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        style={{ opacity: flowDirection === 'TB' ? 1 : 0 }}
      />
      <Handle type="source" id="right" position={Position.Right} style={{ opacity: flowDirection === 'LR' ? 1 : 0 }} />
    </>
  )
}
