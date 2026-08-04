import { useState } from 'react'

import { approvalsClient } from '../../client'
import { useMutationErrorHandler } from '../../hooks/useMutationErrorHandler'
import { useAlerts } from '../../providers/alerts'

type DecisionType = 'approved' | 'rejected'

export function useBulkApprovalActions(selectedApprovalIds: Set<string>, onSuccess: () => void) {
  const { showSuccess, showAlert } = useAlerts()
  const handleError = useMutationErrorHandler()
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false)
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false)

  const bulkDecisionMutation = approvalsClient.useMutation('post', '/approvals/batch')

  const handleBulkDecision = (note: string | null, status: DecisionType, setDialogOpen: (open: boolean) => void) => {
    const decisions = Array.from(selectedApprovalIds).map((approvalId) => ({
      approval_id: approvalId,
      status,
      notes: note,
    }))

    const actionLabel = status === 'approved' ? 'approved' : 'rejected'
    const actionPastTense = status === 'approved' ? 'Approved' : 'Rejected'
    const actionNoun = status === 'approved' ? 'approval' : 'rejection'
    const successTitle = status === 'approved' ? 'Approvals submitted' : 'Approvals rejected'

    bulkDecisionMutation.mutate(
      { body: { decisions } },
      {
        onSuccess: (response) => {
          const { total_success, total_failed } = response

          setDialogOpen(false)

          if (total_failed === 0) {
            showSuccess({
              title: successTitle,
              description: `Successfully ${actionLabel} ${total_success} approval${total_success === 1 ? '' : 's'}.`,
            })
          } else {
            showAlert({
              title: 'Partial success',
              description: `${actionPastTense} ${total_success} approval${total_success === 1 ? '' : 's'}, but ${total_failed} failed. Check the list and try again.`,
              variant: 'warning',
              autoDismiss: false,
            })
          }

          onSuccess()
        },
        onError: handleError({ title: `Bulk ${actionNoun} failed` }),
        onSettled: () => {
          setDialogOpen(false)
        },
      }
    )
  }

  const handleBulkApprove = (note: string | null) => {
    handleBulkDecision(note, 'approved', setBulkApproveDialogOpen)
  }

  const handleBulkReject = (note: string | null) => {
    handleBulkDecision(note, 'rejected', setBulkRejectDialogOpen)
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
