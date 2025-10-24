import type { TaskActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { BrainIcon, FileTerminalIcon } from 'lucide-react'
import { CodeBlock } from '../../../../components/details/CodeBlock'
import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { NodeExpandToggle } from './common/NodeExpandToggle'
import { NodeHeader } from './common/NodeHeader'
import { NodeIcon } from './common/NodeIcon'
import { NodeTitle } from './common/NodeTitle'

export type TaskNode = { type: 'task' } & Node<TaskActivity>

const executorMetadata: Record<string, { icon: React.ReactNode; label: string }> = {
  script: { icon: <FileTerminalIcon />, label: 'Script' },
  agentic: { icon: <BrainIcon />, label: 'Agentic' },
}

export function TaskNodeComponent(props: NodeProps<TaskNode>) {
  return (
    <NodeComponent className="rounded-3xl" nodeProps={props}>
      <TaskActivityDetails data={props.data} />
    </NodeComponent>
  )
}

export function TaskActivityDetails(props: { data: TaskActivity; showJson?: boolean }) {
  const { icon: Icon, label: taskExecutor } = executorMetadata[props.data.task.executor]
  return (
    <>
      <NodeHeader>
        <NodeIcon>{Icon}</NodeIcon>
        <NodeTitle title={props.data.name} subTitle={taskExecutor} />
        <NodeExpandToggle />
      </NodeHeader>
      <NodeBody>
        <Details>
          {props.data.condition && (
            <Detail label="Condition">
              <CodeBlock>{props.data.condition}</CodeBlock>
            </Detail>
          )}
          {props.data.task.executor === 'script' && (
            <>
              <Detail label={props.data.task.config.language}>
                <CodeBlock>{props.data.task.config.code}</CodeBlock>
              </Detail>
              {props.data.task.inputs && (
                <Detail label="Inputs">
                  <CodeBlock>
                    {Object.entries(props.data.task.inputs)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join('\n')}
                  </CodeBlock>
                </Detail>
              )}
              {props.data.task.outputs && (
                <Detail label="Outputs">
                  <CodeBlock>
                    {Object.entries(props.data.task.outputs)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join('\n')}
                  </CodeBlock>
                </Detail>
              )}
            </>
          )}
          {props.showJson && (
            <Detail label="JSON">
              <CodeBlock jsonObject={props.data} />
            </Detail>
          )}
        </Details>
      </NodeBody>
    </>
  )
}
