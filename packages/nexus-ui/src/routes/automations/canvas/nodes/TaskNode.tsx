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
  // Check if this is an AAP/connector node disguised as agentic (workaround for backend)
  const overrideExecutorType = props.data.metadata?.__executorType

  // Parse connector data if it's the workaround format (agentic executor with connector data in prompt)
  let connectorData: { connectorId?: string; operation?: string; parameters?: Record<string, unknown> } | null = null
  let detectedExecutorType: string | undefined = overrideExecutorType

  // If executor is agentic, check the prompt to detect connector/AAP nodes
  // This handles both cases: when metadata exists and when it's missing after save/load
  if (props.data.task.executor === 'agentic') {
    try {
      const parsed = JSON.parse(props.data.task.config.prompt || '{}')
      if (parsed.__type === 'connector') {
        connectorData = {
          connectorId: parsed.connectorId,
          operation: parsed.operation,
          parameters: parsed.parameters,
        }
        // If metadata is missing, detect AAP nodes from connectorId
        // Check if this is an AAP connector (ansible-automation-platform)
        if (
          !detectedExecutorType &&
          (parsed.connectorId === 'ansible-automation-platform' || parsed.connectorId?.includes('ansible'))
        ) {
          detectedExecutorType = 'aap'
        }
      }
    } catch {
      // Fallthrough
    }
  }

  const actualExecutor = detectedExecutorType || props.data.task.executor
  const executorMeta = executorMetadata[actualExecutor] || executorMetadata[props.data.task.executor]
  const Icon = executorMeta?.icon
  const taskExecutor = executorMeta?.label || 'Task'

  return (
    <>
      <StandardNodeHeader
        icon={Icon ? <Icon /> : undefined}
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
          {props.data.task.executor === 'connector' && (
            <>
              {renderText('Connector', props.data.task.config.connectorId)}
              {renderText('Operation', props.data.task.config.operation)}
              {renderObject('Parameters', props.data.task.config.parameters)}
            </>
          )}
          {/* Render connector details for workaround format (agentic executor with connector data) */}
          {detectedExecutorType && connectorData && (
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
