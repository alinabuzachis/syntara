import type { TaskActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { NodeComponent } from './common/NodeComponent'
import { NodeTitle } from './common/NodeTitle'

export type TaskNode = { type: 'task' } & Node<TaskActivity>

export function TaskNodeComponent(props: NodeProps<TaskNode>) {
  return (
    <NodeComponent className="rounded-3xl">
      <NodeTitle type="Task" name={props.data.name} />
      <dl className="details">
        <dt>Executor</dt>
        <dd>{props.data.task.executor}</dd>
        {props.data.condition && (
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
    </NodeComponent>
  )
}
