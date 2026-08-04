import { RhUiAddCircleFillIcon } from '@patternfly/react-icons'

import { RegistryNodeId } from '../../../../constants'
import { createGenericActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { GenericNodeForm } from '../../node-forms/GenericNodeForm'
import { buildNamedActivity } from '../../utils/nodeCreationHelpers'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Generic placeholder node type
 * This step type is used internally (e.g., for loop bodies) but is not shown in the AddNodePanel
 * Users cannot manually add this step - it's only created programmatically
 */
export default function registerGenericNode() {
  NodeRegistry.register({
    id: RegistryNodeId.GENERIC,
    label: 'Generic Step',
    icon: RhUiAddCircleFillIcon,
    category: 'other',
    description: 'Placeholder step — click to configure',
    keywords: ['placeholder', 'generic', 'new', 'configure'],
    order: 1000, // High order to appear last in lists
    enabled: false, // Hide from AddNodePanel - only used programmatically
    formComponent: GenericNodeForm,
    onSubmit: (_data, onSuccess, onError) => {
      try {
        // Create generic placeholder activity
        const { activityId, activity } = buildNamedActivity('Generic Step', undefined, (id, name) =>
          createGenericActivity(id, name)
        )

        useWorkflowStore.getState().addActivity(activity)
        onSuccess(activityId)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add generic step')
      }
    },
  })
}
