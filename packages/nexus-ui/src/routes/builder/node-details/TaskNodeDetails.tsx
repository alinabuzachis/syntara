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

/**
 * SECURITY: JSON.parse reviver that strips prototype pollution keys during parsing.
 */
function safeJSONReviver(key: string, value: unknown): unknown {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return undefined
  }
  return value
}

interface TaskNodeDetailsProps {
  taskData: Activity
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

  // In v2, activity.type IS the executor directly
  const executor = taskData.type

  // Detect the actual node type - handles disguised AAP/connector nodes
  const { actualExecutor, detectedExecutorType } = detectTaskNodeType(taskData as TaskActivity)

  // In v2, config is at activity.config (not activity.task.config)
  const config = taskData.config ?? {}

  // AAP (incl. connector-backed with executor still "agentic") must be checked before the generic
  // agentic branch, or those tasks would incorrectly show AI Agent details.
  const isAAPTask =
    detectedExecutorType === DetectedExecutorType.AAP || actualExecutor === ExecutorTypeEnum.AAP_JOB_TEMPLATE
  if (isAAPTask) {
    const aapConfig = config as {
      job_template_id?: number
      inventory_id?: number
      credentials?: number[]
      extra_vars?: Record<string, unknown>
      limit?: string
      tags?: string
      skip_tags?: string
      verbosity?: number
      // Legacy field names for backward compat
      jobTemplateId?: number
      inventory?: number
      extraVars?: Record<string, unknown>
      skipTags?: string
    }

    const jobTemplateId = aapConfig.job_template_id ?? aapConfig.jobTemplateId
    const inventory = aapConfig.inventory_id ?? aapConfig.inventory
    const extraVars = aapConfig.extra_vars ?? aapConfig.extraVars
    const skipTags = aapConfig.skip_tags ?? aapConfig.skipTags

    const aapInitialData: Partial<AAPFormData> = {
      name: taskData.name,
      jobTemplateId: jobTemplateId?.toString() ?? '',
      inventory: inventory?.toString() ?? '',
      credentials: aapConfig.credentials?.join(',') ?? '',
      extraVars: extraVars ? JSON.stringify(extraVars, null, 2) : '',
      limit: aapConfig.limit ?? '',
      tags: aapConfig.tags ?? '',
      skipTags: skipTags ?? '',
      verbosity: aapConfig.verbosity?.toString() ?? '',
    }

    const handleAAPSubmit = (data: AAPFormData) => {
      try {
        // Parse jobTemplateId (required)
        const parsedJobTemplateId = parsePositiveInt(data.jobTemplateId)
        if (!parsedJobTemplateId) {
          throw new Error('Job Template ID must be a valid positive integer')
        }

        const aapNodeConfig = buildAAPConfig(data)
        const updatedActivity = createAAPJobTemplateActivity(nodeId, data.name, parsedJobTemplateId, aapNodeConfig)

        updateActivity(nodeId, updatedActivity)
        onClose()
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Failed to update step', 'Update Failed')
      }
    }

    return (
      <AAPNodeForm
        initialData={aapInitialData}
        submitButtonText="Update step"
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
        taskData={taskData}
        nodeId={nodeId}
        onClose={onClose}
        onHeaderContentChange={onHeaderContentChange}
      />
    )
  }

  // Handle standard executors (script, http_request)
  if (executor !== ExecutorTypeEnum.SCRIPT && executor !== ExecutorTypeEnum.HTTP_REQUEST) {
    return null
  }

  const initialData: Partial<RegistryActionFormData> = {
    name: taskData.name,
    executor: executor === ExecutorTypeEnum.SCRIPT ? ExecutorTypeEnum.SCRIPT : ExecutorTypeEnum.HTTP_REQUEST,
    language: executor === ExecutorTypeEnum.SCRIPT ? (config.language as string | undefined) : undefined,
    code: executor === ExecutorTypeEnum.SCRIPT ? (config.code as string | undefined) : undefined,
    method:
      executor === ExecutorTypeEnum.HTTP_REQUEST
        ? (config.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined)
        : undefined,
    url: executor === ExecutorTypeEnum.HTTP_REQUEST ? (config.url as string | undefined) : undefined,
    headers:
      executor === ExecutorTypeEnum.HTTP_REQUEST && config.headers
        ? JSON.stringify(config.headers, null, 2)
        : undefined,
    body:
      executor === ExecutorTypeEnum.HTTP_REQUEST && config.body
        ? typeof config.body === 'string'
          ? config.body
          : JSON.stringify(config.body, null, 2)
        : undefined,
  }

  const handleSubmit = (data: RegistryActionFormData) => {
    try {
      // Validate headers JSON format if provided
      if (data.executor === ExecutorTypeEnum.HTTP_REQUEST && data.headers) {
        try {
          JSON.parse(data.headers, safeJSONReviver)
        } catch {
          // Invalid JSON - show error and keep form data intact for user to fix
          showError(
            'Invalid Headers Format',
            'Headers must be valid JSON. Please fix the format before saving. Example: {"Content-Type": "application/json"}'
          )
          return // Exit early to prevent double-error notification
        }
      }

      const apiHeaders =
        data.executor === ExecutorTypeEnum.HTTP_REQUEST && data.headers
          ? (JSON.parse(data.headers, safeJSONReviver) as Record<string, string>)
          : undefined

      const mergedApiHeaders =
        data.executor === ExecutorTypeEnum.HTTP_REQUEST && data.authentication
          ? { ...(apiHeaders ?? {}), Authorization: data.authentication }
          : apiHeaders

      // In v2, build a flat node with type = executor and config at top level
      const updatedActivity = {
        ...taskData,
        name: data.name,
        type: data.executor === ExecutorTypeEnum.SCRIPT ? ExecutorTypeEnum.SCRIPT : ExecutorTypeEnum.HTTP_REQUEST,
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
                      return JSON.parse(data.body, safeJSONReviver) as unknown
                    } catch {
                      return data.body
                    }
                  })(),
                }),
              },
      } as Activity

      updateActivity(nodeId, updatedActivity)
      onClose()
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update step', 'Update Failed')
    }
  }

  return (
    <ActionNodeForm
      initialData={initialData}
      submitButtonText="Update step"
      onSubmit={handleSubmit}
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
