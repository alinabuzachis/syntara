import type { TaskActivity } from '@ansible/nexus-contracts'
import type { Node } from '@xyflow/react'
import type { ComponentType } from 'react'

import { detectTaskNodeType } from './common/detectTaskNodeType'
import { executorMetadata, nodeMetadata } from './nodeMetadata'
import type { NodeType } from './NodeType'

export type IconDescriptor = {
  icon?: ComponentType<{ className?: string }>
  id?: string
}

export function getTaskIconDescriptor(taskData: TaskActivity): IconDescriptor {
  const { detectedExecutorType, actualExecutor } = detectTaskNodeType(taskData)
  const executorMeta = executorMetadata[actualExecutor] || executorMetadata[taskData.task.executor]
  let iconId = 'action-script'

  if (detectedExecutorType === 'aap' || actualExecutor === 'aap_job_template') {
    iconId = 'aap'
  } else if (detectedExecutorType === 'approval') {
    iconId = 'approval'
  } else if (actualExecutor === 'agentic') {
    iconId = 'agent'
  } else if (actualExecutor === 'api') {
    iconId = 'action-api'
  }
  return { icon: executorMeta?.icon, id: iconId }
}

export function getCanvasNodeIconDescriptor(
  node: Pick<Node<NodeType['data']>, 'id' | 'type' | 'data'>,
  currentWorkflow?: { triggers?: Array<{ type?: string }> } | null
): IconDescriptor {
  if (node.type === 'trigger') {
    const triggerIndex = Number.parseInt(node.id.split('-')[1] || '0')
    const triggerType =
      currentWorkflow?.triggers?.[triggerIndex]?.type ?? (node.data as { triggerType?: string }).triggerType
    if (triggerType === 'scheduled') {
      return { icon: nodeMetadata.scheduledTrigger.icon, id: 'trigger-scheduled' }
    }
    return { icon: nodeMetadata.trigger.icon, id: 'trigger-manual' }
  }

  if (node.type === 'condition') {
    return { icon: nodeMetadata.condition.icon, id: 'logic-condition' }
  }

  if (node.type === 'loop') {
    return { icon: nodeMetadata.loop.icon, id: 'logic-loop' }
  }

  if (node.type === 'converge') {
    return { icon: nodeMetadata.converge.icon, id: 'logic-converge' }
  }

  if (node.type === 'approval') {
    return { icon: executorMetadata.approval.icon, id: 'approval' }
  }

  if (node.type === 'task') {
    const taskData = node.data as TaskActivity
    return getTaskIconDescriptor(taskData)
  }

  return { icon: undefined, id: undefined }
}
