import type { TaskActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { useContext } from 'react'
import { SidePanelContext } from '../../SidePanelContext'
import { NodeComponent } from './common/NodeComponent'
import { NodeTitle } from './common/NodeTitle'

export type TaskNode = { type: 'task' } & Node<TaskActivity>

export function TaskNodeComponent(props: NodeProps<TaskNode>) {
  const [, setSidePanel] = useContext(SidePanelContext)
  return (
    <NodeComponent
      className="rounded-3xl"
      onClick={() => {
        setSidePanel(<TaskActivityDetails data={props.data} />)
      }}
    >
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
      </dl>
    </NodeComponent>
  )
}

export function TaskActivityDetails(props: { data: TaskActivity }) {
  return (
    <div className="flex flex-col gap-6 p-8">
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
        {props.data.task.config && (
          <>
            <dt>Config</dt>
            <dd>
              <pre>{JSON.stringify(props.data.task.config, null, 2)}</pre>
            </dd>
          </>
        )}
        <dt>JSON</dt>
        <dd>
          <pre className="text-xs">{JSON.stringify(props.data, undefined, 2)}</pre>
        </dd>
      </dl>
    </div>
  )
}
