import type { Approval } from '@ansible/nexus-contracts'
import { Stack, StackItem } from '@patternfly/react-core'

import { NxPanel } from '../../components/layout/NxPanel'
import { SidePanelHeader } from '../../components/SidePanelHeader'
import { ApprovalDetailContent } from '../approvals/ApprovalDetailContent'

import styles from './ApprovalSidePanel.module.css'

type ApprovalSidePanelProps = Readonly<{
  /** The approval object to display details for. */
  approval: Approval
  /** Optional message to display (e.g. the prompt from the approval node config). */
  message?: string
  /** Called when the close button is clicked. Should hide the panel without clearing the pending approval. */
  onClose: () => void
  /** Called after a decision (approve/reject) is successfully submitted. Used to dismiss the panel and clean up state. */
  onDecisionSubmitted: () => void
  /** Optional navigation handler for links within the panel (e.g. clicking the workflow name). Receives the target path. */
  onNavigate?: (path: string) => void
}>

/**
 * Right-side panel for reviewing an approval within the execution viewer.
 * Follows the same layout pattern as WorkflowHistoryCard:
 * fixed-width NxPanel with a header + scrollable body.
 */
export function ApprovalSidePanel({
  approval,
  message,
  onClose,
  onDecisionSubmitted,
  onNavigate,
}: ApprovalSidePanelProps) {
  return (
    <NxPanel hasNoPadding isFullHeight className={styles.panel}>
      <div className={styles.panelInner}>
        <Stack className={styles.panelStack}>
          <StackItem className={styles.headerPadding}>
            <SidePanelHeader title="Review Approval" onClose={onClose} closeAriaLabel="Close approval panel" />
          </StackItem>

          <StackItem isFilled className={styles.bodyPadding}>
            <ApprovalDetailContent
              approval={approval}
              message={message}
              onDecisionSubmitted={onDecisionSubmitted}
              onWorkflowClick={onNavigate}
            />
          </StackItem>
        </Stack>
      </div>
    </NxPanel>
  )
}
