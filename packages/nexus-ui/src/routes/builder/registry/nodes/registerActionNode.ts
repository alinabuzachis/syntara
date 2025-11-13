import { AppWindowIcon } from 'lucide-react'
import { NodeRegistry } from '../NodeRegistry'
import { ActionNodeForm } from '../../node-forms/ActionNodeForm'
import type { ActionFormData } from '../../../hooks/useNodeCreation'
import { createScriptActivity, createApiActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'

/**
 * Register the Action node type
 */
export function registerActionNode() {
  NodeRegistry.register<ActionFormData>({
    id: 'action',
    label: 'Action',
    icon: AppWindowIcon,
    category: 'action',
    description: 'Execute scripts or make API calls',
    keywords: ['script', 'api', 'http', 'python', 'javascript', 'bash', 'rest'],
    order: 30,
    formComponent: ActionNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        // Generate unique activity ID
        const activityId = `activity_${crypto.randomUUID().replace(/-/g, '_')}`

        let activity

        if (data.executor === 'script' && data.language && data.code) {
          activity = createScriptActivity(activityId, data.name, data.language as 'python' | 'javascript', data.code)
        } else if (data.executor === 'api' && data.method && data.url) {
          activity = createApiActivity(
            activityId,
            data.name,
            data.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
            data.url,
            data.headers,
            data.body
          )
        }

        if (activity) {
          useWorkflowStore.getState().addActivity(activity)
          onSuccess()
        } else {
          onError('Invalid action configuration. Please check your inputs.')
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add action')
      }
    },
  })
}
