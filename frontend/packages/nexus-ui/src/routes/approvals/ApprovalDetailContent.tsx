import type { Approval } from '@ansible/nexus-contracts'
import {
  ActionList,
  ActionListItem,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  FormGroup,
  Split,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { RhUiBackwardsIcon, RhUiDislikeIcon, RhUiLikeIcon } from '@patternfly/react-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { approvalsClient } from '../../client'
import { NxCodeBlock } from '../../components/details/NxCodeBlock'
import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { permissionTooltip } from '../../hooks/permissionUtils'
import { useMutationErrorHandler } from '../../hooks/useMutationErrorHandler'
import { useAlerts } from '../../providers/alerts'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'

import styles from './ApprovalDetailContent.module.css'
import { ApprovalStatusBadges } from './approvalUtils'
import { useCanApprovalAction } from './useCanApprovalAction'

/**
 * Fallback extraction for description/prompt text from the approval object.
 * Neither field is in the ApprovalRequestRead contract yet; the mock API includes
 * `description` as an extra field. The primary source is the `message` prop
 * (populated from the workflow activity config). This function is the secondary
 * source for approvals fetched via deep-link where the workflow config isn't available.
 */
function getApprovalMessage(approval: Approval): string | undefined {
  if ('description' in approval && typeof approval.description === 'string') return approval.description
  if ('prompt' in approval && typeof approval.prompt === 'string') return approval.prompt
  return undefined
}

const getDecisionCopy = (decision: 'approved' | 'rejected') => ({
  label: decision === 'approved' ? 'Approval notes' : 'Rejection notes',
  verb: decision === 'approved' ? 'approving' : 'rejecting',
})

const getNotesLabel = (status: string) => {
  if (status === 'approved') return 'Approval notes'
  if (status === 'rejected') return 'Rejection notes'
  return 'Notes'
}

type ApprovalDetailContentProps = Readonly<{
  approval: Approval
  /** Optional message to display (e.g. the prompt from the approval node config). Overrides auto-detection from the approval object. */
  message?: string
  onDecisionSubmitted?: () => void
  onWorkflowClick?: (link: string) => void
}>

/**
 * Reusable approval detail content: decision actions, summary, and context JSON.
 * Used by the execution viewer and builder approval side panels.
 *
 * Layout (top→bottom): Approve/Reject → summary fields → message → JSON block.
 */
const DECIDE_TOOLTIP = permissionTooltip('approve or reject this approval', 'approval:decide')

export function ApprovalDetailContent({
  approval,
  message,
  onDecisionSubmitted,
  onWorkflowClick,
}: ApprovalDetailContentProps) {
  const { showSuccess } = useAlerts()
  const queryClient = useQueryClient()
  const decisionMutation = approvalsClient.useMutation('patch', '/approvals/{approval_id}')
  const handleError = useMutationErrorHandler()
  const { canPerformAction: canDecide, isChecking: isCheckingPermission } = useCanApprovalAction('decide')

  const [pendingDecision, setPendingDecision] = useState<'approved' | 'rejected' | undefined>(undefined)
  const [pendingReason, setPendingReason] = useState('')

  const approvalId = approval.id
  const approvalStatus = approval.status ?? 'pending'
  const isPending = approvalStatus === 'pending'
  const workflowName = approval.workflow_context?.workflow_name || 'Workflow'
  const workflowId = approval.workflow_context?.workflow_version_id
  const workflowLink = workflowId ? `/workflow-builder/${workflowId}` : undefined
  const approvalInitiated = formatDateTime(approval.created_at ?? null)
  const approvalMessage = message || getApprovalMessage(approval)
  const decisionNotes = approval.decision_notes ?? undefined
  const notesLabel = getNotesLabel(approvalStatus)
  const isSubmitting = decisionMutation.isPending
  const canSubmit = isPending && Boolean(pendingDecision) && !decisionMutation.isSuccess
  const decisionCopy = pendingDecision ? getDecisionCopy(pendingDecision) : undefined

  const handleSubmit = () => {
    if (!pendingDecision || !approvalId || isSubmitting) return

    decisionMutation.mutate(
      {
        params: { path: { approval_id: approvalId } },
        body: {
          status: pendingDecision,
          notes: pendingReason.trim() || null,
        },
      },
      {
        onSuccess: () => {
          detachPromise(
            Promise.all([
              queryClient.invalidateQueries({ queryKey: ['get', '/executions/{execution_id}'] }),
              queryClient.invalidateQueries({ queryKey: ['get', '/approvals'] }),
              queryClient.invalidateQueries({ queryKey: ['get', '/approvals/{approval_id}'] }),
            ])
          )
          showSuccess({
            title: pendingDecision === 'approved' ? 'Approval submitted' : 'Rejection submitted',
            description: 'The approval decision has been recorded.',
          })
          setPendingDecision(undefined)
          setPendingReason('')
          onDecisionSubmitted?.()
        },
        onError: handleError({ title: 'Failed to submit decision' }),
      }
    )
  }

  const renderDecisionActions = () => {
    if (!isPending) {
      return (
        <Stack hasGutter>
          <StackItem>
            <ApprovalStatusBadges status={approvalStatus} />
          </StackItem>
          {decisionNotes && (
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{notesLabel}</DescriptionListTerm>
                <DescriptionListDescription>{decisionNotes}</DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          )}
        </Stack>
      )
    }

    if (!pendingDecision) {
      const buttonsDisabled = isSubmitting || isCheckingPermission || !canDecide
      return (
        <ActionList className={styles.buttonGap}>
          <ActionListItem>
            <DisabledWithTooltip isDisabled={!canDecide && !isCheckingPermission} content={DECIDE_TOOLTIP}>
              <Button
                icon={<RhUiLikeIcon />}
                variant="secondary"
                isAriaDisabled={buttonsDisabled}
                onClick={() => setPendingDecision('approved')}
              >
                Approve
              </Button>
            </DisabledWithTooltip>
          </ActionListItem>
          <ActionListItem>
            <DisabledWithTooltip isDisabled={!canDecide && !isCheckingPermission} content={DECIDE_TOOLTIP}>
              <Button
                icon={<RhUiDislikeIcon />}
                variant="secondary"
                isDanger
                isAriaDisabled={buttonsDisabled}
                onClick={() => setPendingDecision('rejected')}
              >
                Reject
              </Button>
            </DisabledWithTooltip>
          </ActionListItem>
        </ActionList>
      )
    }

    return (
      <Stack hasGutter>
        <Split hasGutter>
          <ApprovalStatusBadges status={pendingDecision} />
          <Button
            icon={<RhUiBackwardsIcon />}
            variant="plain"
            isInline
            aria-label="Undo decision"
            isDisabled={isSubmitting}
            onClick={() => setPendingDecision(undefined)}
          />
        </Split>
        <FormGroup isInline label={decisionCopy?.label ?? 'Notes'}>
          <TextInput
            aria-label={decisionCopy?.label ?? 'Notes'}
            value={pendingReason}
            onChange={(_e, value: string) => setPendingReason(value)}
            placeholder={`Explain the reason for ${decisionCopy?.verb ?? 'updating'} this workflow step.`}
          />
        </FormGroup>
      </Stack>
    )
  }

  return (
    <Stack hasGutter className={styles.outerStack}>
      {/* Sticky: decision actions + divider */}
      <StackItem>
        <Stack hasGutter>
          <StackItem>{renderDecisionActions()}</StackItem>
          {isPending && pendingDecision && (
            <StackItem>
              <Button isDisabled={!canSubmit} isLoading={isSubmitting} onClick={handleSubmit}>
                Submit decision
              </Button>
            </StackItem>
          )}
          <StackItem>
            <Divider />
          </StackItem>
        </Stack>
      </StackItem>

      {/* Scrollable: summary fields + JSON context */}
      <StackItem isFilled className={styles.scrollableBody}>
        <Stack hasGutter>
          <StackItem>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>Approval step</DescriptionListTerm>
                <DescriptionListDescription>{approval.name}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Workflow</DescriptionListTerm>
                <DescriptionListDescription>
                  {workflowLink && onWorkflowClick ? (
                    <Button
                      variant="link"
                      isInline
                      onClick={() => onWorkflowClick(workflowLink)}
                      className={styles.workflowLink}
                    >
                      {workflowName}
                    </Button>
                  ) : (
                    workflowName
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Approval initiated</DescriptionListTerm>
                <DescriptionListDescription>{approvalInitiated}</DescriptionListDescription>
              </DescriptionListGroup>
              {approvalMessage && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Message</DescriptionListTerm>
                  <DescriptionListDescription>{approvalMessage}</DescriptionListDescription>
                </DescriptionListGroup>
              )}
            </DescriptionList>
          </StackItem>
          <StackItem className={styles.codeBlockContainer}>
            <NxCodeBlock jsonObject={approval} enableCopy enableExpand expandTitle="Approval context" fillHeight />
          </StackItem>
        </Stack>
      </StackItem>
    </Stack>
  )
}
