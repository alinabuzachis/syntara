import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useAlerts } from '@ansible/nexus-ui-framework'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
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

  if (executor !== 'script' && executor !== 'api') {
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
