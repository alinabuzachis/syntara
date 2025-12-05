import { PlusCircleIcon } from 'lucide-react'

import { createGenericActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { GenericNodeForm } from '../../node-forms/GenericNodeForm'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Generic placeholder node type
 * This node is used internally (e.g., for loop bodies) but is not shown in the AddNodePanel
 * Users cannot manually add this node - it's only created programmatically
 */
export default function registerGenericNode() {
  NodeRegistry.register({
    id: 'generic',
    label: 'Generic Node',
    icon: PlusCircleIcon,
    category: 'other',
    description: 'Placeholder node - click to configure',
    keywords: ['placeholder', 'generic', 'new', 'configure'],
    order: 1000, // High order to appear last in lists
    enabled: false, // Hide from AddNodePanel - only used programmatically
    formComponent: GenericNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        // Generate unique activity ID
        const activityId = `activity_${crypto.randomUUID().replace(/-/g, '_')}`

        // Create generic placeholder activity
        const activity = createGenericActivity(activityId, 'New Node')

        useWorkflowStore.getState().addActivity(activity)
        onSuccess(activityId) // Return the new node ID
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add generic node')
      }
    },
  })
}
