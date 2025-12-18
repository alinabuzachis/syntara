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
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata, executorMetadata } from './nodeMetadata'

export type TaskNode = { type: 'task' } & Node<TaskActivity>

export function TaskNodeComponent(props: NodeProps<TaskNode>) {
  const metadata = nodeMetadata.task
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  return (
    <NodeComponent className={metadata.className} nodeProps={props}>
      <TaskActivityDetails data={props.data} menuActions={menuActions} />
    </NodeComponent>
  )
}

export function TaskActivityDetails(
  props: Readonly<{
    data: TaskActivity
    showJson?: boolean
    menuActions?: ReturnType<typeof useNodeMenuActions>
  }>
) {
  const executorMeta = executorMetadata[props.data.task.executor]
  const Icon = executorMeta?.icon
  const taskExecutor = executorMeta?.label || 'Task'
  const isAAPTask = props.data.task.executor === 'aap_job_template'

  return (
    <>
      <StandardNodeHeader
        icon={
          Icon ? (
            <div
              style={
                isAAPTask
                  ? { width: '32px', height: '32px', marginLeft: '-8px', display: 'flex', alignItems: 'center' }
                  : undefined
              }
            >
              <Icon />
            </div>
          ) : undefined
        }
        title={props.data.name}
        subtitle={taskExecutor}
        expandable
        menuActions={props.menuActions}
      />
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
          {props.data.task.executor === 'aap_job_template' && (
            <>
              {renderText('Job Template ID', props.data.task.config.jobTemplateId?.toString())}
              {renderText('Inventory ID', props.data.task.config.inventory?.toString())}
              {renderObject('Extra Variables', props.data.task.config.extraVars)}
            </>
          )}
          {props.data.task.executor === 'connector' && (
            <>
              {renderText('Connector', props.data.task.config.connectorId)}
              {renderText('Operation', props.data.task.config.operation)}
              {renderObject('Parameters', props.data.task.config.parameters)}
            </>
          )}
          {renderJson(props.data, props.showJson)}
        </Details>
      </NodeBody>
    </>
  )
}
