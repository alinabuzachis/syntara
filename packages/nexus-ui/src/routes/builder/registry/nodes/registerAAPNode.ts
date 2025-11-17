// @ts-expect-error - SVG import as React component
import AnsibleIcon from '../../../../assets/ansible-light.svg?react'
import { AAPNodeForm } from '../../node-forms/AAPNodeForm'
import { createBasicNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the AAP (Ansible Automation Platform) Job Execution node type
 */
export default function registerAAPNode() {
  NodeRegistry.register(
    createBasicNode(
      {
        id: 'aap',
        label: 'AAP Job Execution',
        icon: AnsibleIcon,
        category: 'action',
        description: 'Execute Ansible Automation Platform jobs',
        keywords: ['ansible', 'aap', 'automation', 'playbook', 'job', 'template'],
        order: 40,
        formComponent: AAPNodeForm,
      },
      'Failed to add AAP node'
    )
  )
}
