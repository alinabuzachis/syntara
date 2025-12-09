// @ts-expect-error - SVG import as React component
import AnsibleIcon from '../../../../assets/ansible-light.svg?react'
import { createConnectorActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { AAPNodeForm } from '../../node-forms/AAPNodeForm'
import type { AAPFormData } from '../../node-forms/AAPNodeForm'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the AAP (Ansible Automation Platform) Job Execution node type
 */
export default function registerAAPNode() {
  NodeRegistry.register<AAPFormData>({
    id: 'aap',
    label: 'AAP Job Execution',
    icon: AnsibleIcon,
    category: 'action',
    description: 'Execute Ansible Automation Platform jobs',
    keywords: ['ansible', 'aap', 'automation', 'playbook', 'job', 'template'],
    order: 40,
    formComponent: AAPNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        const activityId = `activity_${crypto.randomUUID().replace(/-/g, '_')}`

        const activity = createConnectorActivity(
          activityId,
          data.name,
          data.connectorId,
          data.operation,
          data.parameters
        )

        useWorkflowStore.getState().addActivity(activity)
        onSuccess(activityId)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add AAP node')
      }
    },
  })
}
