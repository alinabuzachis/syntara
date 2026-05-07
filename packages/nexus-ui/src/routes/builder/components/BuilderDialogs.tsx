import type { Approval } from '@ansible/nexus-contracts'
import { Checkbox, Content, Stack, StackItem } from '@patternfly/react-core'
import { useState, type Dispatch } from 'react'

import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { BuilderAction } from '../builderReducer'

import { ApprovalReviewModal } from './ApprovalReviewModal'
import { RunWorkflowModal } from './RunWorkflowModal'

const RUN_CONFIRM_DISMISSED_KEY = 'nexus-run-workflow-confirm-dismissed'

function getRunConfirmDismissed(): boolean {
  try {
    return localStorage.getItem(RUN_CONFIRM_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

function setRunConfirmDismissed(): void {
  try {
    localStorage.setItem(RUN_CONFIRM_DISMISSED_KEY, 'true')
  } catch {
    // ignore – storage unavailable
  }
}

type BuilderDialogsProps = Readonly<{
  workflowName: string
  workflowId: string | null
  confirmDialogOpen: boolean
  deleteDialogOpen: boolean
  dispatch: Dispatch<BuilderAction>
  handleRunWorkflow: (inputData?: Record<string, unknown>, triggerNodeId?: string) => void
  handleDeleteWorkflow: () => void
  pendingApproval: Approval | null
  approvalViewOpen: boolean
  activityNameMap: Map<string, string>
  handleApprovalClose: () => void
  triggerName: string
  triggerNodeId?: string
  triggerInputSchema?: Record<string, unknown>
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
  triggerName,
  triggerNodeId,
  triggerInputSchema,
}: BuilderDialogsProps) {
  const [confirmedRun, setConfirmedRun] = useState(false)
  const [doNotShowAgain, setDoNotShowAgain] = useState(false)
  const [prevConfirmDialogOpen, setPrevConfirmDialogOpen] = useState(confirmDialogOpen)
  const isDirty = useWorkflowStore((state) => state.isDirty)

  // Reset per-open state whenever the dialog transitions from closed → open.
  // This handles the case where the run succeeds and the reducer closes the
  // dialog directly (bypassing closeAll), leaving confirmedRun stale.
  //
  // Note: we use the React "derived state" pattern (setState during render) rather than
  // useEffect because the project ESLint rule `react-hooks/set-state-in-effect` flags
  // synchronous setState calls inside effects. Calling setState during render is the
  // React-endorsed alternative for prop-driven state resets (getDerivedStateFromProps pattern).
  if (confirmDialogOpen && !prevConfirmDialogOpen) {
    setPrevConfirmDialogOpen(true)
    setConfirmedRun(false)
    setDoNotShowAgain(false)
  } else if (!confirmDialogOpen && prevConfirmDialogOpen) {
    setPrevConfirmDialogOpen(false)
  }

  // Derive which step to show without calling setState in effects.
  // If dismissed previously, go straight to the input modal.
  // Only skip the confirmation when clean — dirty runs always need explicit user agreement to save.
  const skipConfirm = confirmDialogOpen && !isDirty && getRunConfirmDismissed()
  const showConfirmStep = confirmDialogOpen && !skipConfirm && !confirmedRun
  const showInputStep = confirmDialogOpen && (skipConfirm || confirmedRun)

  const closeAll = () => {
    dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
    setConfirmedRun(false)
    setDoNotShowAgain(false)
  }

  const handleConfirmRun = () => {
    if (doNotShowAgain) {
      setRunConfirmDismissed()
    }
    setConfirmedRun(true)
  }
  return (
    <>
      <ConfirmationDialog
        isOpen={showConfirmStep}
        onClose={closeAll}
        onConfirm={handleConfirmRun}
        title={`Run ${workflowName}?`}
        confirmLabel={isDirty ? 'Save and run' : 'Run now'}
        aria-labelledby="run-workflow-modal-title"
        aria-describedby="run-workflow-modal-description"
      >
        <Stack hasGutter>
          <StackItem>
            <Content component="p">
              {isDirty
                ? 'You are about to save and run this workflow. Your unsaved changes will be saved before the workflow starts, bypassing its normal trigger conditions.'
                : `You are able to run this automation starting from ${triggerName}. This action will start the workflow immediately, bypassing its normal trigger conditions.`}
            </Content>
          </StackItem>
          <StackItem>
            <Checkbox
              id="run-workflow-do-not-show-again"
              label="Don't show again"
              isChecked={doNotShowAgain}
              onChange={(_event, checked) => setDoNotShowAgain(checked)}
            />
          </StackItem>
        </Stack>
      </ConfirmationDialog>
      <RunWorkflowModal
        key={showInputStep ? `open-${triggerNodeId ?? ''}` : 'closed'}
        isOpen={showInputStep}
        onClose={closeAll}
        onConfirm={handleRunWorkflow}
        workflowName={workflowName}
        triggerName={triggerName}
        triggerNodeId={triggerNodeId}
        inputSchema={triggerInputSchema}
      />
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
