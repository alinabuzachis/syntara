import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useAlerts } from '@ansible/nexus-ui-framework'

import { createConnectorActivity, useWorkflowStore } from '../../../stores/useWorkflowStore'
import { AAPNodeForm } from '../node-forms/AAPNodeForm'
import type { AAPFormData } from '../node-forms/AAPNodeForm'
import { ActionNodeForm } from '../node-forms/ActionNodeForm'

type TaskActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'task' }

interface TaskNodeDetailsProps {
  taskData: TaskActivity
  nodeId: string
  onClose: () => void
}

export function TaskNodeDetails({ taskData, nodeId, onClose }: TaskNodeDetailsProps) {
  const { showError } = useAlerts()
  const updateActivity = useWorkflowStore((state) => state.updateActivity)
  const executor = taskData.task.executor
  const isAAPNode = taskData.metadata?.__executorType === 'aap'

  // Check if this is an AAP connector task (could be native format or workaround format)
  if (executor === 'connector' || isAAPNode) {
    let connectorId: string = ''
    let operation: string = ''
    let parameters: string | undefined

    if (isAAPNode && executor === 'agentic') {
      // Workaround format - parse from prompt
      try {
        const agenticConfig = taskData.task.config as { prompt?: string }
        const parsed = JSON.parse(agenticConfig.prompt || '{}')
        if (parsed.__type === 'connector') {
          connectorId = parsed.connectorId
          operation = parsed.operation
          parameters = parsed.parameters ? JSON.stringify(parsed.parameters, null, 2) : undefined
        }
      } catch {
        // Fallback to empty values
      }
    } else {
      // Native connector format
      const connectorConfig = taskData.task.config as {
        connectorId: string
        operation: string
        parameters?: Record<string, unknown>
      }
      connectorId = connectorConfig.connectorId
      operation = connectorConfig.operation
      parameters = connectorConfig.parameters ? JSON.stringify(connectorConfig.parameters, null, 2) : undefined
    }

    const aapInitialData: Partial<AAPFormData> = {
      name: taskData.name,
      connectorId,
      operation,
      parameters,
      requiresApproval: taskData.requiresApproval,
    }

    const handleAAPSubmit = (data: AAPFormData) => {
      try {
        // Create activity using the same format we use when adding new nodes
        // This ensures consistency with the backend workaround
        const updatedActivity = createConnectorActivity(
          nodeId,
          data.name,
          data.connectorId,
          data.operation,
          data.parameters,
          data.requiresApproval
        )

        updateActivity(nodeId, updatedActivity)
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
