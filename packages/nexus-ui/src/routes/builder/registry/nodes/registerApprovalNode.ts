import { UserCheckIcon } from 'lucide-react'

import { ApprovalNodeForm } from '../../node-forms/ApprovalNodeForm'
import { createBasicNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Approval node type
 */
export default function registerApprovalNode() {
  NodeRegistry.register(
    createBasicNode({
      id: 'approval',
      label: 'Approval',
      icon: UserCheckIcon,
      category: 'logic',
      description: 'Require human approval before continuing workflow',
      keywords: ['approve', 'approval', 'review', 'manual', 'gate', 'checkpoint'],
      order: 50,
      formComponent: ApprovalNodeForm,
    })
  )
}
