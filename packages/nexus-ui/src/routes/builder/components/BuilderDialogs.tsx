import type { Approval } from '@ansible/nexus-contracts'
import { Content, Stack, StackItem } from '@patternfly/react-core'
import type { Dispatch } from 'react'

import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { BuilderAction } from '../builderReducer'

import { ApprovalReviewModal } from './ApprovalReviewModal'

type BuilderDialogsProps = Readonly<{
  workflowName: string
  workflowId: string | null
  confirmDialogOpen: boolean
  deleteDialogOpen: boolean
  dispatch: Dispatch<BuilderAction>
  handleRunWorkflow: () => void
  handleDeleteWorkflow: () => void
  pendingApproval: Approval | null
  approvalViewOpen: boolean
  activityNameMap: Map<string, string>
  handleApprovalClose: () => void
}>

export function BuilderDialogs({
  workflowName,
  workflowId,
  confirmDialogOpen,
  deleteDialogOpen,
  dispatch,
  handleRunWorkflow,
  handleDeleteWorkflow,
  pendingApproval,
  approvalViewOpen,
  activityNameMap,
  handleApprovalClose,
}: BuilderDialogsProps) {
  const isDirty = useWorkflowStore((state) => state.isDirty)

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDialogOpen}
        onClose={() => dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })}
        onConfirm={handleRunWorkflow}
        title={`Run ${workflowName}?`}
        confirmLabel={isDirty ? 'Save and run' : 'Run now'}
        aria-labelledby="run-workflow-modal-title"
        aria-describedby="run-workflow-modal-description"
      >
        {isDirty
          ? 'You are about to save and run this workflow. Your unsaved changes will be saved before the workflow starts, bypassing its normal trigger conditions.'
          : 'You are about to manually run this workflow. This action will start the workflow immediately, bypassing its normal trigger conditions.'}
      </ConfirmationDialog>
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}
        onConfirm={handleDeleteWorkflow}
        title="Delete workflow?"
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
        aria-labelledby="delete-workflow-modal-title"
        aria-describedby="delete-workflow-modal-body"
        destructiveAcknowledgement={{
          checkboxId: `delete-workflow-ack-${workflowId ?? ''}`,
          label: 'I understand this workflow will be permanently deleted.',
        }}
      >
        <Stack hasGutter>
          <StackItem>
            <Content component="p">
              The workflow <strong>{workflowName}</strong> will be deleted. This cannot be undone.
            </Content>
          </StackItem>
        </Stack>
      </ConfirmationDialog>
      <ApprovalReviewModal
        approval={pendingApproval}
        isOpen={approvalViewOpen}
        activityNameMap={activityNameMap}
        onClose={handleApprovalClose}
      />
    </>
  )
}
