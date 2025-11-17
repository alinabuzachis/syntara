import type { TaskActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'

import { Details } from '../../../../components/details/Details'

import {
  renderCondition,
  renderInputs,
  renderOutputs,
  renderJson,
  renderObject,
  renderText,
} from './common/detailRenderers'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { nodeMetadata, executorMetadata } from './nodeMetadata'

export type TaskNode = { type: 'task' } & Node<TaskActivity>

export function TaskNodeComponent(props: NodeProps<TaskNode>) {
  const metadata = nodeMetadata.task
  return (
    <NodeComponent className={metadata.className} nodeProps={props}>
      <TaskActivityDetails data={props.data} />
    </NodeComponent>
  )
}

export function TaskActivityDetails(props: { data: TaskActivity; showJson?: boolean }) {
  const { icon: Icon, label: taskExecutor } = executorMetadata[props.data.task.executor]
  return (
    <>
      <StandardNodeHeader icon={<Icon />} title={props.data.name} subtitle={taskExecutor} expandable />
      <NodeBody>
        <Details>
          {renderCondition(props.data.condition)}
          {props.data.task.executor === 'script' && (
            <>
              {renderText(props.data.task.config.language, props.data.task.config.code)}
              {renderInputs(props.data.task.inputs)}
              {renderOutputs(props.data.task.outputs)}
            </>
          )}
          {props.data.task.executor === 'api' && (
            <>
              {renderText('Method', props.data.task.config.method)}
              {renderText('URL', props.data.task.config.url)}
              {renderObject('Headers', props.data.task.config.headers)}
              {renderObject('Body', props.data.task.config.body)}
            </>
          )}
          {renderJson(props.data, props.showJson)}
        </Details>
      </NodeBody>
    </>
  )
}
