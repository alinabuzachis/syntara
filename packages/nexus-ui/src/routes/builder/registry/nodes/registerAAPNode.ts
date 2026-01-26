import AnsibleIcon from '../../../../assets/ansible-automation-platform.svg?react'
import { createAAPJobTemplateActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { AAPNodeForm } from '../../node-forms/AAPNodeForm'
import type { AAPFormData } from '../../node-forms/AAPNodeForm'
import { buildAAPConfig, parsePositiveInt } from '../../utils/aapHelpers'
import { buildNamedActivity } from '../../utils/nodeCreationHelpers'
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
        // Parse jobTemplateId (required)
        const jobTemplateId = parsePositiveInt(data.jobTemplateId)
        if (!jobTemplateId) {
          throw new Error('Job Template ID must be a valid positive integer')
        }

        const config = buildAAPConfig(data)
        const { activityId, activity } = buildNamedActivity('AAP Job Execution', data.name, (id, name) =>
          createAAPJobTemplateActivity(id, name, jobTemplateId, config)
        )

        useWorkflowStore.getState().addActivity(activity)
        onSuccess(activityId)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add AAP node')
      }
    },
  })
}
