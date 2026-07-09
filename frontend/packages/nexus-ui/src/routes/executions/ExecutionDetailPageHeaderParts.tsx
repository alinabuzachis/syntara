import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { Button, FlexItem, Label } from '@patternfly/react-core'

import { ApprovalPendingBadge } from '../../components/labels/ApprovalPendingBadge'
import { StatusLabel } from '../builder/ExecutionStatus'
import { formatHistoryDateTime } from '../builder/historyDateUtils'
import { RunHistoryToggleButton } from '../builder/RunHistoryToggleButton'

import { ApprovalActionButtons } from './ApprovalActionButtons'
import { CancelExecutionButton } from './CancelExecutionButton'

type Execution = ExecutionsAPI.components['schemas']['ExecutionRead']

export function ExecutionDetailTitleRowAddons({ execution }: Readonly<{ execution: Execution | undefined }>) {
  if (!execution?.status && !execution?.created_at) {
    return null
  }
  return (
    <>
      {execution.status ? (
        <FlexItem>
          <StatusLabel status={execution.status} />
        </FlexItem>
      ) : null}
      {execution.approval_pending ? (
        <FlexItem>
          <ApprovalPendingBadge approvalPending={execution.approval_pending} />
        </FlexItem>
      ) : null}
      {execution.created_at ? (
        <FlexItem>
          <Label>{`Viewing run: ${formatHistoryDateTime(execution.created_at)}`}</Label>
        </FlexItem>
      ) : null}
    </>
  )
}

export type ExecutionDetailHeaderToolbarProps = Readonly<{
  showApprovalActionStrip: boolean
  isApprovalLoading: boolean
  isApprovalPanelOpen?: boolean
  onReviewClick: () => void
  historyCardOpen: boolean
  onToggleHistory: () => void
  onBackToEditor: () => void
  onCopyToEditor: () => void
  isCancellable: boolean
  executionId: string
}>

export function ExecutionDetailHeaderToolbar({
  showApprovalActionStrip,
  isApprovalLoading,
  isApprovalPanelOpen,
  onReviewClick,
  historyCardOpen,
  onToggleHistory,
  onBackToEditor,
  onCopyToEditor,
  isCancellable,
  executionId,
}: ExecutionDetailHeaderToolbarProps) {
  return (
    <>
      {showApprovalActionStrip && (
        <ApprovalActionButtons
          isLoading={isApprovalLoading}
          isDisabled={isApprovalPanelOpen}
          onReviewClick={onReviewClick}
        />
      )}
      {isCancellable && <CancelExecutionButton executionId={executionId} />}
      <Button variant="secondary" onClick={onCopyToEditor}>
        Copy to editor
      </Button>
      <Button variant="secondary" onClick={onBackToEditor}>
        Back to editor
      </Button>
      <RunHistoryToggleButton onClick={onToggleHistory} isActive={historyCardOpen} />
    </>
  )
}
