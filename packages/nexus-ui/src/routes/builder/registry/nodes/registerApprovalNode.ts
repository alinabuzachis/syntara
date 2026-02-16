import { RhUiUserCheckIcon } from '@patternfly/react-icons'

import { createApprovalActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import type { ApprovalFormSubmitData } from '../../node-forms/ApprovalNodeForm'
import { ApprovalNodeForm } from '../../node-forms/ApprovalNodeForm'
import { buildNamedActivity } from '../../utils/nodeCreationHelpers'
import { getDefaultNodeBaseName } from '../../utils/nodeNaming'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Approval node type
 * Creates a human approval gate that pauses workflow execution until approved
 */
export default function registerApprovalNode() {
  NodeRegistry.register<ApprovalFormSubmitData>({
    id: 'approval',
    label: 'Approval',
    icon: RhUiUserCheckIcon,
    category: 'logic',
    description: 'Wait for approval or human input before continuing',
    keywords: ['approve', 'approval', 'review', 'manual', 'gate', 'checkpoint'],
    order: 50,
    formComponent: ApprovalNodeForm,
    enabled: true,
    onSubmit: (data, onSuccess, onError) => {
      try {
        // Create approval activity with workflow store helper
        const baseName = getDefaultNodeBaseName({ nodeTypeId: 'approval', label: 'Approval' })
        const { activityId, activity } = buildNamedActivity(baseName, data.name, (id, name) =>
          createApprovalActivity(id, name, data.approvers, data.prompt, data.timeout, data.onTimeout)
        )

        // Add to workflow store
        useWorkflowStore.getState().addActivity(activity)
        onSuccess(activityId) // Return the new node ID for canvas placement
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add approval node')
      }
    },
  })
}
