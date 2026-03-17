import { ExecutorTypeEnum, type TaskActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'

import { Details } from '../../../../components/details/Details'
import type { ActivityStatus } from '../../execution/types'

import { renderCondition, renderJson, renderObject, renderText } from './common/detailRenderers'
import { detectTaskNodeType, type TaskActivityWithMetadata } from './common/detectTaskNodeType'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { getTaskIconDescriptor } from './nodeIconResolver'
import { nodeMetadata, executorMetadata } from './nodeMetadata'
import { renderNodeIcon } from './renderNodeIcon'

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

type AgenticTaskConfig = {
  tools?: string[]
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
        status: ActivityStatus
        started_at?: string
        completed_at?: string
        error_details?: string
        retry_count?: number
      }
    | undefined

  const showExecutionBadge =
    (props.data as { metadata?: { __showExecutionBadge?: boolean } }).metadata?.__showExecutionBadge === true

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

// eslint-disable-next-line complexity
export function TaskActivityDetails(
  props: Readonly<{
    data: TaskActivity
    showJson?: boolean
    menuActions?: ReturnType<typeof useNodeMenuActions>
  }>
) {
  // Detect the actual node type and extract any connector data
  const { connectorData, actualExecutor } = detectTaskNodeType(props.data)
  const dataWithMetadata = props.data as TaskActivityWithMetadata

  const executorMeta = executorMetadata[actualExecutor] || executorMetadata[props.data.task.executor]
  const { id: iconId } = getTaskIconDescriptor(props.data)
  const iconNode = renderNodeIcon(executorMeta?.icon, iconId)
  const taskExecutorLabel = executorMeta?.label || 'Task'
  const taskExecutor = actualExecutor || props.data.task.executor
  const aapTask = iconId === 'aap' ? (props.data as unknown as AAPJobTemplateTask) : null
  const agentConfig =
    props.data.task.executor === ExecutorTypeEnum.AGENTIC ? (props.data.task.config as AgenticTaskConfig) : undefined

  const formatCount = (count: number, singular: string, plural = `${singular}s`) =>
    `${count} ${count === 1 ? singular : plural}`

  const toolsCount = agentConfig?.tools?.length
  const toolsText = toolsCount !== undefined ? formatCount(toolsCount, 'tool') : undefined
  return (
    <>
      <StandardNodeHeader
        icon={iconNode}
        title={props.data.name}
        subtitle={taskExecutorLabel}
        expandable
        menuActions={props.menuActions}
      />
      <NodeBody>
        <Details>
          {renderCondition(dataWithMetadata.condition)}
          {taskExecutor === ExecutorTypeEnum.SCRIPT && (
            <>{renderText('Language', (props.data.task.config as { language: string }).language)}</>
          )}
          {taskExecutor === ExecutorTypeEnum.API && (
            <>
              {renderText('Method', (props.data.task.config as { method: string }).method)}
              {renderText('URL', (props.data.task.config as { url: string }).url)}
            </>
          )}
          {aapTask && (
            <>
              {renderText('Job Template ID', aapTask.task.config.jobTemplateId?.toString())}
              {renderText('Inventory ID', aapTask.task.config.inventory?.toString())}
            </>
          )}
          {taskExecutor === ExecutorTypeEnum.CONNECTOR && (
            <>
              {renderText('Connector', (props.data.task.config as { connectorId: string }).connectorId)}
              {renderText('Operation', (props.data.task.config as { operation: string }).operation)}
              {renderObject(
                'Parameters',
                (props.data.task.config as { parameters?: Record<string, unknown> }).parameters
              )}
            </>
          )}
          {/* Render agentic task details */}
          {taskExecutor === ExecutorTypeEnum.AGENTIC && !connectorData && (
            <>
              {renderText('Model', (props.data.task.config as { model?: string }).model)}
              {renderText('Tools', toolsText)}
              {(() => {
                const fileIds = (props.data.task.config as { fileIds?: string[] }).fileIds
                return fileIds && fileIds.length > 0
                  ? renderText('Agent context', `${fileIds.length} file${fileIds.length === 1 ? '' : 's'}`)
                  : null
              })()}
            </>
          )}
          {/* Render connector details for workaround format (agentic executor with connector data) */}
          {connectorData && (
            <>
              {renderText('Connector', connectorData.connectorId)}
              {renderText('Operation', connectorData.operation)}
              {renderObject('Parameters', connectorData.parameters)}
            </>
          )}
          {taskExecutor !== ExecutorTypeEnum.SCRIPT && renderJson(props.data, props.showJson)}
        </Details>
      </NodeBody>
    </>
  )
}
