import AnsibleIcon from '../../../../assets/ansible-automation-platform.svg?react'
import { RegistryNodeId } from '../../../../constants'
import { createAAPJobTemplateActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { AAPNodeForm } from '../../node-forms/AAPNodeForm'
import type { AAPFormData } from '../../node-forms/AAPNodeForm'
import {
  buildAAPConfig,
  buildExpressionModeActivity,
  hasExpressionValue,
  validateJobTemplateId,
} from '../../utils/aapHelpers'
import { buildNamedActivity } from '../../utils/nodeCreationHelpers'
import { getDefaultNodeBaseName } from '../../utils/nodeNaming'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the AAP (Ansible Automation Platform) Job Execution step type
 */
export default function registerAAPNode() {
  NodeRegistry.register<AAPFormData>({
    id: RegistryNodeId.AAP,
    label: 'AAP Job Execution',
    icon: AnsibleIcon,
    category: 'action',
    description: 'Execute Ansible Automation Platform jobs',
    keywords: ['ansible', 'aap', 'workflow', 'playbook', 'job', 'template'],
    order: 40,
    formComponent: AAPNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        if (hasExpressionValue(data.job_template_name, data.organization_name)) {
          const baseName = getDefaultNodeBaseName({ nodeTypeId: RegistryNodeId.AAP, label: 'AAP Job Execution' })
          const { activityId, activity } = buildNamedActivity(baseName, data.name, (id, name) =>
            buildExpressionModeActivity(id, name, data)
          )
          useWorkflowStore.getState().addActivity(activity)
          onSuccess(activityId)
        } else {
          const job_template_id = validateJobTemplateId(data.job_template_id)
          const config = buildAAPConfig(data)
          const baseName = getDefaultNodeBaseName({ nodeTypeId: RegistryNodeId.AAP, label: 'AAP Job Execution' })
          const { activityId, activity } = buildNamedActivity(baseName, data.name, (id, name) =>
            createAAPJobTemplateActivity(id, name, job_template_id, config)
          )
          useWorkflowStore.getState().addActivity(activity)
          onSuccess(activityId)
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add AAP step')
      }
    },
  })
}
