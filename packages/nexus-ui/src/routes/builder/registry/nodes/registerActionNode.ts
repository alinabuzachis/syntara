import { AppWindowIcon } from 'lucide-react'

import { createApiActivity, createScriptActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import type { ActionFormData } from '../../hooks/useNodeCreation'
import { ActionNodeForm } from '../../node-forms/ActionNodeForm'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Action node type
 */
export default function registerActionNode() {
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
          activity = createScriptActivity(
            activityId,
            data.name,
            data.language as 'python' | 'javascript',
            data.code,
            data.parameters
          )
        } else if (data.executor === 'api' && data.method && data.url) {
          activity = createApiActivity(
            activityId,
            data.name,
            data.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
            data.url,
            data.headers,
            data.body,
            data.parameters
          )
        }

        if (activity) {
          // Set requiresApproval if specified
          if (data.requiresApproval) {
            activity.requiresApproval = true
          }
          useWorkflowStore.getState().addActivity(activity)
          onSuccess(activityId) // Return the new node ID
        } else {
          onError('Invalid action configuration. Please check your inputs.')
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add action')
      }
    },
  })
}
