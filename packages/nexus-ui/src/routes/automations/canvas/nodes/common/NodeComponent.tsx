import { Handle, Position } from '@xyflow/react'
import clsx from 'clsx'
import { useContext } from 'react'
import { FlowDirectionContext } from '../../FlowDirectionContext'

export function NodeComponent(props: {
  children: React.ReactNode
  disableSource?: boolean
  disableTarget?: boolean
  className?: string
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
}) {
  const [flowDirection] = useContext(FlowDirectionContext)
  return (
    <div
      className={clsx('glass card flex flex-col gap-4 border-2 px-6 py-4 shadow-md shadow-black/50', props.className)}
      onClick={props.onClick}
    >
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
