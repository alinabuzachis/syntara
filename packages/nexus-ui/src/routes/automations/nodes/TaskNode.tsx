import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowAPI } from 'nexus-contracts'
import { useContext } from 'react'
import { FlowDirectionContext } from '../FlowDirectionContext'

export type TaskActivity = WorkflowAPI.components['schemas']['taskActivity']
export type TaskNode = { type: 'task' } & Node<TaskActivity>

export function TaskNodeComponent(props: NodeProps<TaskNode>) {
  const [flowDirection] = useContext(FlowDirectionContext)

  return (
    <>
      <div>
        <label className="text-lg font-bold">{props.data.name}</label>
        <div className="text-xs text-white/60">Task</div>
      </div>
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
