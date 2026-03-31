import { ActivityTypeEnum, ExecutorTypeEnum, type Activity, type TaskActivity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import {
  detectTaskNodeType,
  DetectedExecutorType,
} from '../../../routes/automations/canvas/nodes/common/detectTaskNodeType'
import { createAAPJobTemplateActivity, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import type { ActionFormData as RegistryActionFormData } from '../hooks/useNodeCreation'
import { AAPNodeForm } from '../node-forms/AAPNodeForm'
import type { AAPFormData } from '../node-forms/AAPNodeForm'
import { ActionNodeForm } from '../node-forms/ActionNodeForm'
import { buildAAPConfig, parsePositiveInt } from '../utils/aapHelpers'

import { AIAgentNodeDetails } from './AIAgentNodeDetails'

type TaskOrApprovalActivity = (TaskActivity | Extract<Activity, { type: 'approval' }>) & {
  task: { executor: string; config: unknown }
}

interface TaskNodeDetailsProps {
  taskData: TaskOrApprovalActivity
  nodeId: string
  onClose: () => void
  onHeaderContentChange: (content: ReactNode | null) => void
}

// eslint-disable-next-line complexity
export function TaskNodeDetails({ taskData, nodeId, onClose, onHeaderContentChange }: TaskNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()

  // Don't show action form for approval nodes - they have their own form
  if (taskData.type === ActivityTypeEnum.APPROVAL) {
    return null
  }

  // Detect the actual node type - handles disguised AAP/connector nodes
  const { actualExecutor, detectedExecutorType } = detectTaskNodeType(taskData)

  const executor = taskData.task.executor as string

  // AAP (incl. connector-backed with executor still "agentic") must be checked before the generic
  // agentic branch, or those tasks would incorrectly show AI Agent details.
  const isAAPTask =
    detectedExecutorType === DetectedExecutorType.AAP || actualExecutor === ExecutorTypeEnum.AAP_JOB_TEMPLATE
  if (isAAPTask) {
    const aapConfig = taskData.task.config as unknown as {
      jobTemplateId: number
      inventory?: number
      credentials?: number[]
      extraVars?: Record<string, unknown>
      limit?: string
      tags?: string
      skipTags?: string
      verbosity?: number
    }

    const aapInitialData: Partial<AAPFormData> = {
      name: taskData.name,
      jobTemplateId: aapConfig.jobTemplateId?.toString() ?? '',
      inventory: aapConfig.inventory?.toString() ?? '',
      credentials: aapConfig.credentials?.join(',') ?? '',
      extraVars: aapConfig.extraVars ? JSON.stringify(aapConfig.extraVars, null, 2) : '',
      limit: aapConfig.limit ?? '',
      tags: aapConfig.tags ?? '',
      skipTags: aapConfig.skipTags ?? '',
      verbosity: aapConfig.verbosity?.toString() ?? '',
    }

    const handleAAPSubmit = (data: AAPFormData) => {
      try {
        // Parse jobTemplateId (required)
        const jobTemplateId = parsePositiveInt(data.jobTemplateId)
        if (!jobTemplateId) {
          throw new Error('Job Template ID must be a valid positive integer')
        }

        const config = buildAAPConfig(data)
        const updatedActivity = createAAPJobTemplateActivity(nodeId, data.name, jobTemplateId, config)

        updateActivity(nodeId, updatedActivity)
        onClose()
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Failed to update node', 'Update Failed')
      }
    }

    return (
      <AAPNodeForm
        initialData={aapInitialData}
        submitButtonText="Update node"
        onSubmit={handleAAPSubmit}
        onCancel={onClose}
        onHeaderContentChange={onHeaderContentChange}
      />
    )
  }

  // True agentic tasks (not AAP-in-disguise)
  if (executor === ExecutorTypeEnum.AGENTIC) {
    return (
      <AIAgentNodeDetails
        taskData={taskData as TaskActivity & { task: { executor: 'agentic'; config: unknown } }}
        nodeId={nodeId}
        onClose={onClose}
        onHeaderContentChange={onHeaderContentChange}
      />
    )
  }

  // Handle standard executors (script, api, agentic)
  if (executor !== 'script' && executor !== 'api' && executor !== 'agentic') {
    return null
  }

  // Store requiresApproval separately since ActionFormData doesn't include it
  const requiresApproval = taskData.requiresApproval

  const initialData: Partial<RegistryActionFormData> = {
    name: taskData.name,
    executor: executor as 'script' | 'api',
    language:
      executor === ExecutorTypeEnum.SCRIPT ? (taskData.task.config as { language?: string }).language : undefined,
    code: executor === ExecutorTypeEnum.SCRIPT ? (taskData.task.config as { code?: string }).code : undefined,
    method:
      executor === ExecutorTypeEnum.API
        ? ((taskData.task.config as { method?: string }).method as
            | 'GET'
            | 'POST'
            | 'PUT'
            | 'PATCH'
            | 'DELETE'
            | undefined)
        : undefined,
    url: executor === ExecutorTypeEnum.API ? (taskData.task.config as { url?: string }).url : undefined,
    headers:
      executor === ExecutorTypeEnum.API && (taskData.task.config as { headers?: unknown }).headers
        ? JSON.stringify((taskData.task.config as { headers: unknown }).headers, null, 2)
        : undefined,
    body:
      executor === ExecutorTypeEnum.API && (taskData.task.config as { body?: unknown }).body
        ? typeof (taskData.task.config as { body: unknown }).body === 'string'
          ? (taskData.task.config as { body: string }).body
          : JSON.stringify((taskData.task.config as { body: unknown }).body, null, 2)
        : undefined,
    parameters: taskData.task.inputs ? JSON.stringify(taskData.task.inputs, null, 2) : undefined,
  }

  const handleSubmit = (data: RegistryActionFormData) => {
    try {
      const apiHeaders =
        data.executor === ExecutorTypeEnum.API && data.headers
          ? (JSON.parse(data.headers) as Record<string, string>)
          : undefined

      const mergedApiHeaders =
        data.executor === ExecutorTypeEnum.API && data.authentication
          ? { ...(apiHeaders ?? {}), Authorization: data.authentication }
          : apiHeaders

      const updatedActivity = {
        ...taskData,
        name: data.name,
        requiresApproval: requiresApproval ?? undefined,
        task: {
          executor: data.executor,
          config:
            data.executor === ExecutorTypeEnum.SCRIPT
              ? {
                  language: data.language ?? 'python',
                  code: data.code!,
                }
              : {
                  method: data.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
                  url: data.url!,
                  ...(mergedApiHeaders && { headers: mergedApiHeaders }),
                  ...(data.body && {
                    body: (() => {
                      try {
                        return JSON.parse(data.body) as unknown
                      } catch {
                        return data.body
                      }
                    })(),
                  }),
                },
          ...(data.parameters && {
            inputs: (() => {
              const parsed: unknown = JSON.parse(data.parameters)
              if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed as { [key: string]: unknown }
              }
              return undefined
            })(),
          }),
        },
      } as TaskActivity

      updateActivity(nodeId, updatedActivity)
      onClose()
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update node', 'Update Failed')
    }
  }

  return (
    <ActionNodeForm
      initialData={initialData}
      submitButtonText="Update node"
      onSubmit={handleSubmit}
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
