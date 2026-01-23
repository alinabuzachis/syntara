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
import { detectNodeType, type TaskActivityWithMetadata } from './common/detectNodeType'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata, executorMetadata } from './nodeMetadata'

type AAPJobTemplateConfig = {
  jobTemplateId?: string | number
  inventory?: string | number
  extraVars?: Record<string, unknown>
}

type AAPJobTemplateTask = {
  task: {
    executor: string
    config: AAPJobTemplateConfig
  }
}

export type TaskNode = { type: 'task' } & Node<TaskActivity>

export function TaskNodeComponent(props: NodeProps<TaskNode>) {
  const metadata = nodeMetadata.task
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  // Extract execution state if present
  const executionState = (props.data as Record<string, unknown>).__executionState as
    | {
        status: string
        started_at?: string
        completed_at?: string
        error_details?: string
        retry_count?: number
      }
    | undefined

  const showExecutionBadge = !!(props.data as Record<string, unknown>).metadata?.__showExecutionBadge

  return (
    <NodeComponent
      className={metadata.className}
      nodeProps={props}
      executionState={executionState}
      showExecutionBadge={showExecutionBadge}
    >
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
  // Detect the actual node type and extract any connector data
  const { detectedExecutorType, connectorData, actualExecutor } = detectNodeType(props.data)
  const dataWithMetadata = props.data as TaskActivityWithMetadata
  const executorMeta = executorMetadata[actualExecutor] || executorMetadata[props.data.task.executor]
  const Icon = executorMeta?.icon
  const taskExecutor = executorMeta?.label || 'Task'
  // Check if this is an AAP task by checking the detected executor type
  const isAAPTask = detectedExecutorType === 'aap' || actualExecutor === 'aap_job_template'
  const aapTask = isAAPTask ? (props.data as unknown as AAPJobTemplateTask) : null

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
          {renderCondition(dataWithMetadata.condition)}
          {/* Render approval details if this is an approval node */}
          {detectedExecutorType === 'approval' && props.data.approval && (
            <>{renderText('Usernames to notify', props.data.approval.approvers.join(', '))}</>
          )}
          {props.data.task.executor === 'script' && detectedExecutorType !== 'approval' && (
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
              {renderObject('Body', props.data.task.config.body as Record<string, unknown> | undefined)}
            </>
          )}
          {aapTask && (
            <>
              {renderText('Job Template ID', aapTask.task.config.jobTemplateId?.toString())}
              {renderText('Inventory ID', aapTask.task.config.inventory?.toString())}
              {renderObject('Extra Variables', aapTask.task.config.extraVars)}
            </>
          )}
          {props.data.task.executor === 'connector' && (
            <>
              {renderText('Connector', props.data.task.config.connectorId)}
              {renderText('Operation', props.data.task.config.operation)}
              {renderObject('Parameters', props.data.task.config.parameters)}
            </>
          )}
          {/* Render agentic task details */}
          {props.data.task.executor === 'agentic' && !connectorData && detectedExecutorType !== 'approval' && (
            <>{renderText('Model', props.data.task.config.model)}</>
          )}
          {/* Render connector details for workaround format (agentic executor with connector data) */}
          {detectedExecutorType && detectedExecutorType !== 'approval' && connectorData && (
            <>
              {renderText('Connector', connectorData.connectorId)}
              {renderText('Operation', connectorData.operation)}
              {renderObject('Parameters', connectorData.parameters)}
            </>
          )}
          {renderJson(props.data, props.showJson)}
        </Details>
      </NodeBody>
    </>
  )
}
