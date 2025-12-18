import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useAlerts } from '@ansible/nexus-ui-framework'

import { createAAPJobTemplateActivity, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { AAPNodeForm } from '../node-forms/AAPNodeForm'
import type { AAPFormData } from '../node-forms/AAPNodeForm'
import { ActionNodeForm } from '../node-forms/ActionNodeForm'
import { buildAAPConfig, parsePositiveInt } from '../utils/aapHelpers'

type TaskActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'task' }

interface TaskNodeDetailsProps {
  taskData: TaskActivity
  nodeId: string
  onClose: () => void
}

export function TaskNodeDetails({ taskData, nodeId, onClose }: TaskNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()
  const executor = taskData.task.executor

  // Check if this is an AAP job template task
  if (executor === 'aap_job_template') {
    const aapConfig = taskData.task.config as {
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
      />
    )
  }

  if (executor !== 'script' && executor !== 'api' && executor !== 'agentic') {
    return null
  }

  const initialData = {
    name: taskData.name,
    executor: executor,
    language: executor === 'script' ? taskData.task.config.language : undefined,
    code: executor === 'script' ? taskData.task.config.code : undefined,
    method: executor === 'api' ? taskData.task.config.method : undefined,
    url: executor === 'api' ? taskData.task.config.url : undefined,
    headers:
      executor === 'api' && taskData.task.config.headers
        ? JSON.stringify(taskData.task.config.headers, null, 2)
        : undefined,
    body:
      executor === 'api' && taskData.task.config.body
        ? typeof taskData.task.config.body === 'string'
          ? taskData.task.config.body
          : JSON.stringify(taskData.task.config.body, null, 2)
        : undefined,
    parameters: taskData.task.inputs ? JSON.stringify(taskData.task.inputs, null, 2) : undefined,
    requiresApproval: taskData.requiresApproval,
  }

  const handleSubmit = (data: typeof initialData) => {
    try {
      const updatedActivity: TaskActivity = {
        ...taskData,
        name: data.name,
        requiresApproval: data.requiresApproval || undefined,
        task: {
          executor: data.executor as 'script' | 'api',
          config:
            data.executor === 'script'
              ? {
                  language: data.language as 'python' | 'bash',
                  code: data.code!,
                }
              : {
                  method: data.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
                  url: data.url!,
                  ...(data.headers && { headers: JSON.parse(data.headers) }),
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
      }

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
    />
  )
}
