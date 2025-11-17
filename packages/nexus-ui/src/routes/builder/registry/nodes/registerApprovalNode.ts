import { UserCheckIcon } from 'lucide-react'

import { ApprovalNodeForm } from '../../node-forms/ApprovalNodeForm'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Approval node type
 */
export function registerApprovalNode() {
  NodeRegistry.register({
    id: 'approval',
    label: 'Approval',
    icon: UserCheckIcon,
    category: 'logic',
    description: 'Require human approval before continuing workflow',
    keywords: ['approve', 'approval', 'review', 'manual', 'gate', 'checkpoint'],
    order: 50,
    formComponent: ApprovalNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        // Approval node submission will be implemented
        // when the form provides proper data structure
        onSuccess()
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add Approval node')
      }
    },
  })
}
