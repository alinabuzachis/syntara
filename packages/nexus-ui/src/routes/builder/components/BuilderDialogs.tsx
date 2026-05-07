import type { Approval } from '@ansible/nexus-contracts'
import { Checkbox, Content, Stack, StackItem } from '@patternfly/react-core'
import { useState, type Dispatch } from 'react'

import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import type { DialogState } from '../../../hooks/useDialogState'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { BuilderAction } from '../builderReducer'

import { ApprovalReviewModal } from './ApprovalReviewModal'
import { RunWorkflowModal } from './RunWorkflowModal'
import type { TestStepDialogData } from './TestStepDialog'
import { TestStepDialog } from './TestStepDialog'

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
  testStepDialog: DialogState<TestStepDialogData>
  onTestExecutionCreated?: (executionId: string) => void
}>

function useRunConfirmState(confirmDialogOpen: boolean, isDirty: boolean, dispatch: Dispatch<BuilderAction>) {
  const [confirmedRun, setConfirmedRun] = useState(false)
  const [doNotShowAgain, setDoNotShowAgain] = useState(false)
  const [prevOpen, setPrevOpen] = useState(confirmDialogOpen)

  // getDerivedStateFromProps pattern — reset state on open/close transitions
  if (confirmDialogOpen && !prevOpen) {
    setPrevOpen(true)
    setConfirmedRun(false)
    setDoNotShowAgain(false)
  } else if (!confirmDialogOpen && prevOpen) {
    setPrevOpen(false)
  }

  const skipConfirm = confirmDialogOpen && !isDirty && getRunConfirmDismissed()

  return {
    showConfirmStep: confirmDialogOpen && !skipConfirm && !confirmedRun,
    showInputStep: confirmDialogOpen && (skipConfirm || confirmedRun),
    doNotShowAgain,
    setDoNotShowAgain,
    closeAll: () => {
      dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
      setConfirmedRun(false)
      setDoNotShowAgain(false)
    },
    handleConfirmRun: () => {
      if (doNotShowAgain) setRunConfirmDismissed()
      setConfirmedRun(true)
    },
  }
}

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
  testStepDialog,
  onTestExecutionCreated,
}: BuilderDialogsProps) {
  const isDirty = useWorkflowStore((state) => state.isDirty)
  const { showConfirmStep, showInputStep, doNotShowAgain, setDoNotShowAgain, closeAll, handleConfirmRun } =
    useRunConfirmState(confirmDialogOpen, isDirty, dispatch)
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
      <TestStepDialog
        isOpen={testStepDialog.isOpen}
        onClose={testStepDialog.close}
        onExecutionCreated={onTestExecutionCreated}
        nodeId={testStepDialog.item?.nodeId ?? null}
        nodeName={testStepDialog.item?.nodeName ?? ''}
        workflowId={workflowId ?? ''}
        predecessors={testStepDialog.item?.predecessors}
      />
    </>
  )
}
