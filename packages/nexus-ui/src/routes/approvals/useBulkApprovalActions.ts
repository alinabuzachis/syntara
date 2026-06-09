import { useState } from 'react'

import { approvalsClient } from '../../client'
import { useMutationErrorHandler } from '../../hooks/useMutationErrorHandler'
import { useAlerts } from '../../providers/alerts'

export function useBulkApprovalActions(selectedApprovalIds: Set<string>, onSuccess: () => void) {
  const { showSuccess, showAlert } = useAlerts()
  const handleError = useMutationErrorHandler()
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
            showSuccess({
              title: 'Approvals submitted',
              description: `Successfully approved ${total_success} approval${total_success === 1 ? '' : 's'}.`,
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
        onError: handleError({ title: 'Bulk approval failed' }),
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
            showSuccess({
              title: 'Approvals rejected',
              description: `Successfully rejected ${total_success} approval${total_success === 1 ? '' : 's'}.`,
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
        onError: handleError({ title: 'Bulk rejection failed' }),
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
