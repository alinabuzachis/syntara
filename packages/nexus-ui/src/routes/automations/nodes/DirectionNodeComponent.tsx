import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'
import { useContext } from 'react'
import { FlowDirectionContext } from '../FlowDirectionContext'

export function DirectionNodeComponent(props: {
  children: React.ReactNode
  disableSource?: boolean
  disableTarget?: boolean
  className?: string
}) {
  const [flowDirection] = useContext(FlowDirectionContext)

  return (
    <div className={clsx('card flex flex-col gap-4 p-6', props.className)}>
      {props.children}
      {!props.disableTarget && (
        <>
          <Handle type="target" id="top" position={Position.Top} style={{ opacity: flowDirection === 'TB' ? 1 : 0 }} />
          <Handle
            type="target"
            id="left"
            position={Position.Left}
            style={{ opacity: flowDirection === 'LR' ? 1 : 0 }}
          />
        </>
      )}
      {!props.disableSource && (
        <>
          <Handle
            type="source"
            id="bottom"
            position={Position.Bottom}
            style={{ opacity: flowDirection === 'TB' ? 1 : 0 }}
          />
          <Handle
            type="source"
            id="right"
            position={Position.Right}
            style={{ opacity: flowDirection === 'LR' ? 1 : 0 }}
          />
        </>
      )}
    </div>
  )
}
