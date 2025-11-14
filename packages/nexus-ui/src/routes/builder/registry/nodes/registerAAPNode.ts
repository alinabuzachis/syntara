// @ts-expect-error - SVG import as React component
import AnsibleIcon from '../../../../assets/ansible-light.svg?react'
import { NodeRegistry } from '../NodeRegistry'
import { AAPNodeForm } from '../../node-forms/AAPNodeForm'

/**
 * Register the AAP (Ansible Automation Platform) Job Execution node type
 */
export function registerAAPNode() {
  NodeRegistry.register({
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
        // AAP node submission will be implemented
        // when the form provides proper data structure
        onSuccess()
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add AAP node')
      }
    },
  })
}
