import { ExecutorTypeEnum, type TaskActivity } from '@ansible/nexus-contracts'
import { Content } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'

import { Details } from '../../../../components/details/Details'
import { FlowNodeType } from '../../../../constants'
import type { ActivityStatus } from '../../execution/types'
import { getNodeTypeColor } from '../nodeTypeColors'

import { renderCondition, renderJson, renderText } from './common/detailRenderers'
import { detectTaskNodeType, type TaskActivityWithMetadata } from './common/detectTaskNodeType'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { getTaskIconDescriptor } from './nodeIconResolver'
import { nodeMetadata, executorMetadata } from './nodeMetadata'
import { renderNodeIcon } from './renderNodeIcon'
import { getTaskSemanticLabels } from './taskSemanticLabels'

type AAPJobTemplateConfig = {
  job_template_id?: number
  job_template_name?: string
  inventory_id?: number
  inventory_name?: string
}

type AAPWorkflowTemplateConfig = {
  workflow_job_template_name?: string
  inventory_name?: string
}

type AgenticConfig = {
  tool_selections?: string[]
  tool_selection_strategy?: string
}

export type TaskNode = { type: typeof FlowNodeType.TASK } & Node<TaskActivity>

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
      topBarColor={getNodeTypeColor(FlowNodeType.TASK, props.data)}
      semanticZoomSummary={getTaskSemanticLabels(props.data)}
    >
      <TaskActivityDetails
        data={props.data}
        menuActions={menuActions}
        iconColor={getNodeTypeColor(FlowNodeType.TASK, props.data)}
      />
    </NodeComponent>
  )
}

// eslint-disable-next-line complexity
export function TaskActivityDetails(
  props: Readonly<{
    data: TaskActivity
    showJson?: boolean
    menuActions?: ReturnType<typeof useNodeMenuActions>
    /** Optional color so icon matches node type accent (same as top bar) */
    iconColor?: string
  }>
) {
  // Detect the actual node type — in v2, activity.type IS the executor
  const { actualExecutor } = detectTaskNodeType(props.data)
  const dataWithMetadata = props.data as TaskActivityWithMetadata

  const executorMeta = executorMetadata[actualExecutor] ?? executorMetadata[props.data.type ?? '']
  const { id: iconId } = getTaskIconDescriptor(props.data)
  const iconNode = renderNodeIcon(executorMeta?.icon, iconId, 'canvas', props.iconColor)
  const taskExecutorLabel = executorMeta?.label ?? 'Task'
  const taskExecutor = actualExecutor || (props.data.type ?? '')
  const config = props.data.config ?? {}
  const isAapJobTemplate = taskExecutor === ExecutorTypeEnum.AAP_JOB_TEMPLATE
  const isAapWorkflowTemplate = taskExecutor === ExecutorTypeEnum.AAP_WORKFLOW_JOB_TEMPLATE
  const aapJobConfig = isAapJobTemplate ? (config as AAPJobTemplateConfig) : null
  const aapWorkflowConfig = isAapWorkflowTemplate ? (config as AAPWorkflowTemplateConfig) : null
  const agentConfig = taskExecutor === ExecutorTypeEnum.AGENTIC ? (config as AgenticConfig) : undefined

  const formatCount = (count: number, singular: string, plural = `${singular}s`) =>
    `${count} ${count === 1 ? singular : plural}`

  const toolsCount = agentConfig?.tool_selections?.length
  const toolsText = toolsCount !== undefined ? formatCount(toolsCount, 'tool') : undefined

  return (
    <>
      <StandardNodeHeader
        icon={iconNode}
        badge={undefined}
        title={props.data.name}
        subtitle={taskExecutorLabel}
        expandable
        menuActions={props.menuActions}
      />
      <NodeBody>
        <Details>
          {renderCondition(dataWithMetadata.condition)}
          {taskExecutor === ExecutorTypeEnum.SCRIPT && (
            <>{renderText('Language', (config as { language: string }).language)}</>
          )}
          {taskExecutor === ExecutorTypeEnum.HTTP_REQUEST && (
            <>
              {renderText('Method', (config as { method: string }).method)}
              {renderText('URL', (config as { url: string }).url)}
            </>
          )}
          {aapJobConfig?.job_template_name && (
            <Content style={{ overflowWrap: 'anywhere' }}>{aapJobConfig.job_template_name}</Content>
          )}
          {aapWorkflowConfig?.workflow_job_template_name && (
            <Content style={{ overflowWrap: 'anywhere' }}>{aapWorkflowConfig.workflow_job_template_name}</Content>
          )}
          {/* Render agentic task details */}
          {taskExecutor === ExecutorTypeEnum.AGENTIC && (
            <>
              {renderText('Model', (config as { model?: string }).model)}
              {renderText('Tools', toolsText)}
            </>
          )}
          {taskExecutor !== ExecutorTypeEnum.SCRIPT && renderJson(props.data, props.showJson)}
        </Details>
      </NodeBody>
    </>
  )
}
