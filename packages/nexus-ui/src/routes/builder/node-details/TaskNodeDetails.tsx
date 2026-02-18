import { ExecutorTypeEnum, type TaskActivity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import { detectTaskNodeType } from '../../../routes/automations/canvas/nodes/common/detectTaskNodeType'
import { createAAPJobTemplateActivity, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { AAPNodeForm } from '../node-forms/AAPNodeForm'
import type { AAPFormData } from '../node-forms/AAPNodeForm'
import { ActionNodeForm } from '../node-forms/ActionNodeForm'
import type { ActionFormData } from '../node-forms/ActionNodeForm'
import { buildAAPConfig, parsePositiveInt } from '../utils/aapHelpers'

import { AIAgentNodeDetails } from './AIAgentNodeDetails'

interface TaskNodeDetailsProps {
  taskData: TaskActivity & { task: { executor: string; config: unknown } }
  nodeId: string
  onClose: () => void
  onHeaderContentChange: (content: ReactNode | null) => void
}

export function TaskNodeDetails({ taskData, nodeId, onClose, onHeaderContentChange }: TaskNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()

  // Don't show action form for approval nodes - they have their own form
  if (taskData.type === 'approval') {
    return null
  }

  // Detect the actual node type - handles disguised AAP/connector nodes
  const { actualExecutor, detectedExecutorType } = detectTaskNodeType(taskData)

  const executor = taskData.task.executor as string

  // Check if this is an agentic task
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

  // Check if this is an AAP job template task (including disguised ones)
  const isAAPTask = detectedExecutorType === 'aap' || actualExecutor === 'aap_job_template'
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
      jobTemplateId: aapConfig.jobTemplateId?.toString() || '',
      inventory: aapConfig.inventory?.toString() || '',
      credentials: aapConfig.credentials?.join(',') || '',
      extraVars: aapConfig.extraVars ? JSON.stringify(aapConfig.extraVars, null, 2) : '',
      limit: aapConfig.limit || '',
      tags: aapConfig.tags || '',
      skipTags: aapConfig.skipTags || '',
      verbosity: aapConfig.verbosity?.toString() || '',
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

  // Handle standard executors (script, api, agentic)
  if (executor !== 'script' && executor !== 'api' && executor !== 'agentic') {
    return null
  }

  // Store requiresApproval separately since ActionFormData doesn't include it
  const requiresApproval = taskData.requiresApproval

  const initialData: Partial<ActionFormData> = {
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

  const handleSubmit = (data: ActionFormData) => {
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
        requiresApproval: requiresApproval || undefined,
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
                        return JSON.parse(data.body)
                      } catch {
                        return data.body
                      }
                    })(),
                  }),
                },
          ...(data.parameters && { inputs: JSON.parse(data.parameters) }),
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
      onCancel={onClose}
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
