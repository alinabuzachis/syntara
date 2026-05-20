import { useState } from 'react'

import { approvalsClient } from '../../client'
import { useAlerts } from '../../providers/alerts'

export function useBulkApprovalActions(selectedApprovalIds: Set<string>, onSuccess: () => void) {
  const { showAlert } = useAlerts()
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false)
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false)

  const bulkDecisionMutation = approvalsClient.useMutation('post', '/approvals/batch')

  const handleBulkApprove = (note: string | null) => {
    const decisions = Array.from(selectedApprovalIds).map((approvalId) => ({
      approval_id: approvalId,
      status: 'approved' as const,
      notes: note,
    }))

    bulkDecisionMutation.mutate(
      { body: { decisions } },
      {
        onSuccess: (response) => {
          const { total_success, total_failed } = response

          setBulkApproveDialogOpen(false)

          if (total_failed === 0) {
            showAlert({
              title: 'Approvals submitted',
              description: `Successfully approved ${total_success} approval${total_success === 1 ? '' : 's'}.`,
              variant: 'success',
              autoDismiss: true,
            })
          } else {
            showAlert({
              title: 'Partial success',
              description: `Approved ${total_success} approval${total_success === 1 ? '' : 's'}, but ${total_failed} failed. Check the list and try again.`,
              variant: 'warning',
              autoDismiss: false,
            })
          }

          onSuccess()
        },
        onError: () => {
          showAlert({
            title: 'Bulk approval failed',
            description: 'An error occurred while approving the selected items. Please try again.',
            variant: 'danger',
            autoDismiss: false,
          })
        },
        onSettled: () => {
          setBulkApproveDialogOpen(false)
        },
      }
    )
  }

  const handleBulkReject = (note: string) => {
    const decisions = Array.from(selectedApprovalIds).map((approvalId) => ({
      approval_id: approvalId,
      status: 'rejected' as const,
      notes: note,
    }))

    bulkDecisionMutation.mutate(
      { body: { decisions } },
      {
        onSuccess: (response) => {
          const { total_success, total_failed } = response

          setBulkRejectDialogOpen(false)

          if (total_failed === 0) {
            showAlert({
              title: 'Approvals rejected',
              description: `Successfully rejected ${total_success} approval${total_success === 1 ? '' : 's'}.`,
              variant: 'success',
              autoDismiss: true,
            })
          } else {
            showAlert({
              title: 'Partial success',
              description: `Rejected ${total_success} approval${total_success === 1 ? '' : 's'}, but ${total_failed} failed. Check the list and try again.`,
              variant: 'warning',
              autoDismiss: false,
            })
          }

          onSuccess()
        },
        onError: () => {
          showAlert({
            title: 'Bulk rejection failed',
            description: 'An error occurred while rejecting the selected items. Please try again.',
            variant: 'danger',
            autoDismiss: false,
          })
        },
        onSettled: () => {
          setBulkRejectDialogOpen(false)
        },
      }
    )
  }

  return {
    bulkApproveDialogOpen,
    setBulkApproveDialogOpen,
    bulkRejectDialogOpen,
    setBulkRejectDialogOpen,
    handleBulkApprove,
    handleBulkReject,
    isPending: bulkDecisionMutation.isPending,
  }
}
