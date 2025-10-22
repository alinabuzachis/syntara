import type { TaskActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { BrainIcon, TerminalIcon } from 'lucide-react'
import { useContext } from 'react'
import { SidePanelContext } from '../../SidePanelContext'
import { NodeBody, NodeComponent } from './common/NodeComponent'
import { NodeTitle } from './common/NodeTitle'

export type TaskNode = { type: 'task' } & Node<TaskActivity>

export function TaskNodeComponent(props: NodeProps<TaskNode>) {
  const [, setSidePanel] = useContext(SidePanelContext)

  let Icon = TerminalIcon
  switch (props.data.task.executor) {
    case 'script':
      Icon = TerminalIcon
      break
    case 'agentic':
      Icon = BrainIcon
      break
  }

  let taskExecutor: string = props.data.task.executor
  switch (taskExecutor) {
    case 'script':
      taskExecutor = 'Script'
      break
    case 'agentic':
      taskExecutor = 'Agentic'
      break
  }

  return (
    <NodeComponent
      className="rounded-3xl"
      onClick={() => {
        setSidePanel(
          <div className="flex flex-col gap-4 p-8">
            <NodeTitle type={taskExecutor} name={props.data.name} icon={<Icon />} disableExpand />
            <TaskActivityDetails data={props.data} />
          </div>
        )
      }}
    >
      <NodeTitle type={taskExecutor} name={props.data.name} icon={<Icon />} />
      <NodeBody>
        <TaskActivityDetails data={props.data} />
      </NodeBody>
    </NodeComponent>
  )
}

export function TaskActivityDetails(props: { data: TaskActivity; json?: boolean }) {
  return (
    <dl className="details">
      {/* <dt>Executor</dt>
      <dd>{props.data.task.executor}</dd> */}
      {props.data.condition && (
        <>
          <dt>Condition</dt>
          <dd>{props.data.condition}</dd>
        </>
      )}
      {props.data.task.executor === 'script' && (
        <>
          {/* <dt>Language</dt> */}
          {/* <dd>{props.data.task.config.language}</dd> */}
          <dt>{props.data.task.config.language}</dt>
          <dd>
            <pre className="overflow-auto rounded-xl bg-black/30 px-4 py-2">{props.data.task.config.code}</pre>
          </dd>
        </>
      )}
      {props.json && (
        <>
          <dt>JSON</dt>
          <dd>
            <pre className="overflow-auto rounded-xl bg-black/30 px-4 py-2">
              {JSON.stringify(props.data, undefined, 2)}
            </pre>
          </dd>
        </>
      )}
    </dl>
  )
}
