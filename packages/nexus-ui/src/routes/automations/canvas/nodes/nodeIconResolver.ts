import { ExecutorTypeEnum, type TaskActivity } from '@ansible/nexus-contracts'
import type { Node } from '@xyflow/react'
import type { ComponentType } from 'react'

import { type RegistryNodeIdUnion, RegistryNodeId } from '../../../../constants'
import { parseTriggerIndex } from '../../../../utils/triggerNodeIds'

import { detectTaskNodeType, DetectedExecutorType } from './common/detectTaskNodeType'
import { executorMetadata, nodeMetadata } from './nodeMetadata'
import type { NodeType } from './NodeType'

export type IconDescriptor = {
  icon?: ComponentType<{ className?: string }>
  id?: string
}

export function getTaskIconDescriptor(taskData: TaskActivity): IconDescriptor {
  const { detectedExecutorType, actualExecutor } = detectTaskNodeType(taskData)
  const executorMeta = executorMetadata[actualExecutor] || executorMetadata[taskData.task.executor]
  let iconId: RegistryNodeIdUnion = RegistryNodeId.ACTION_SCRIPT

  if (detectedExecutorType === DetectedExecutorType.AAP || actualExecutor === ExecutorTypeEnum.AAP_JOB_TEMPLATE) {
    iconId = RegistryNodeId.AAP
  } else if (detectedExecutorType === 'approval') {
    iconId = RegistryNodeId.APPROVAL
  } else if (actualExecutor === 'agentic') {
    iconId = RegistryNodeId.AGENT
  } else if (actualExecutor === 'api') {
    iconId = RegistryNodeId.ACTION_API
  }
  return { icon: executorMeta?.icon, id: iconId }
}

export function getCanvasNodeIconDescriptor(
  node: Pick<Node<NodeType['data']>, 'id' | 'type' | 'data'>,
  currentWorkflow?: { triggers?: Array<{ type?: string }> } | null
): IconDescriptor {
  if (node.type === 'trigger') {
    const triggerIndex = parseTriggerIndex(node.id) ?? 0
    const triggerType =
      currentWorkflow?.triggers?.[triggerIndex]?.type ?? (node.data as { triggerType?: string }).triggerType
    if (triggerType === 'scheduled') {
      return { icon: nodeMetadata.scheduledTrigger.icon, id: RegistryNodeId.TRIGGER_SCHEDULED }
    }
    return { icon: nodeMetadata.trigger.icon, id: RegistryNodeId.TRIGGER_MANUAL }
  }

  if (node.type === 'condition') {
    return { icon: nodeMetadata.condition.icon, id: RegistryNodeId.LOGIC_CONDITION }
  }

  if (node.type === 'loop') {
    return { icon: nodeMetadata.loop.icon, id: RegistryNodeId.LOGIC_LOOP }
  }

  if (node.type === 'converge') {
    return { icon: nodeMetadata.converge.icon, id: RegistryNodeId.LOGIC_CONVERGE }
  }

  if (node.type === 'approval') {
    return { icon: executorMetadata.approval.icon, id: RegistryNodeId.APPROVAL }
  }

  if (node.type === 'task') {
    const taskData = node.data as TaskActivity
    return getTaskIconDescriptor(taskData)
  }

  return { icon: undefined, id: undefined }
}
