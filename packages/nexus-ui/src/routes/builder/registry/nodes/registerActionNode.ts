import { RhUiFileCodeIcon, RhUiElectricityFillIcon, RhUiLanguageIcon } from '@patternfly/react-icons'

import { createApiActivity, createScriptActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import type { ActionFormData } from '../../hooks/useNodeCreation'
import { ActionNodeForm } from '../../node-forms/ActionNodeForm'
import { buildNamedActivity } from '../../utils/nodeCreationHelpers'
import { createCustomNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Action node type
 */
export default function registerActionNode() {
  NodeRegistry.register(
    createCustomNode<ActionFormData>(
      {
        id: 'action',
        label: 'Action',
        icon: RhUiElectricityFillIcon,
        category: 'action',
        description: 'Execute scripts or make API calls',
        keywords: ['script', 'api', 'http', 'python', 'javascript', 'bash', 'rest'],
        order: 30,
        selectionTitle: 'Select an action node',
        subtypes: [
          {
            id: 'action-script',
            label: 'Script',
            icon: RhUiFileCodeIcon,
            description: 'Execute code to manage complex conditions, calculate values, or format data.',
            formTitle: 'Configure Script Actions',
            initialData: { executor: 'script' },
          },
          {
            id: 'action-api',
            label: 'REST API',
            icon: RhUiLanguageIcon,
            description: 'Trigger an action or retrieve data from an external source.',
            formTitle: 'Configure REST API Actions',
            initialData: { executor: 'api' },
          },
        ],
        formComponent: ActionNodeForm,
      },
      (data, onSuccess, onError) => {
        try {
          const baseName = data.executor === 'api' ? 'REST API' : 'Script'
          const { activityId, activity } = buildNamedActivity(baseName, data.name, (id, name) => {
            if (data.executor === 'script' && data.language && data.code) {
              return createScriptActivity(id, name, data.language, data.code, data.parameters)
            }
            if (data.executor === 'api' && data.method && data.url) {
              return createApiActivity(
                id,
                name,
                data.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
                data.url,
                data.headers,
                data.body,
                data.parameters,
                data.authentication
              )
            }
            return null
          })

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
      }
    )
  )
}
