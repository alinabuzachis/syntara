import { type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { TaskActivity } from 'nexus-contracts'
import { DirectionNodeComponent } from './DirectionNode'

export type TaskNode = { type: 'task' } & Node<TaskActivity>

export function TaskNodeComponent(props: NodeProps<TaskNode>) {
  return (
    <DirectionNodeComponent className="rounded-3xl">
      <div>
        <label className="text-lg font-bold">{props.data.name}</label>
        <div className="text-xs text-white/60">Task</div>
      </div>
      <dl className="details">
        <dt>Executor</dt>
        <dd>{props.data.task.executor}</dd>
        {'condition' in props.data && typeof props.data.condition === 'string' && (
          <>
            <dt>Condition</dt>
            <dd>{props.data.condition}</dd>
          </>
        )}
        {/* <dt className="font-mono text-xs text-white/50">JSON</dt>
        <dd className="font-mono text-sm">
          <pre>{JSON.stringify(props.data, undefined, 2)}</pre>
        </dd> */}
      </dl>
    </DirectionNodeComponent>
  )
}
