import {
  ActionList,
  ActionListItem,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  FormGroup,
  Split,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { RhUiBackwardsIcon, RhUiDislikeIcon, RhUiLikeIcon } from '@patternfly/react-icons'
import { useState } from 'react'
import { useLocation, useParams } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { AppRoute } from '../../app/AppRoute'
import { approvalsClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { AppPanel } from '../../components/AppPanel'
import { CodeBlock } from '../../components/details/CodeBlock'
import { ErrorState } from '../../components/states/ErrorState'
import { useQueryState } from '../../components/states/useQueryState'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { getDateField } from '../../utils/getDateField'

import { ApprovalStatusBadges } from './approvalUtils'

const getDecisionCopy = (decision: 'approved' | 'rejected') => ({
  label: decision === 'approved' ? 'Approval notes' : 'Rejection notes',
  verb: decision === 'approved' ? 'approving' : 'rejecting',
})

const getNotesLabel = (status: string) => {
  if (status === 'approved') return 'Approval notes'
  if (status === 'rejected') return 'Rejection notes'
  return 'Notes'
}

function ApprovalSummaryList(props: {
  workflowLink?: string
  workflowName: string
  approvalInitiated: string
  onWorkflowClick: (link: string) => void
}) {
  return (
    <DescriptionList
      isAutoColumnWidths
      columnModifier={{ default: '3Col' }}
      style={{ justifyContent: 'space-between' }}
    >
      <DescriptionListGroup>
        <DescriptionListTerm>Approval type</DescriptionListTerm>
        <DescriptionListDescription>
          Approval Node {/** TODO: make this use real type when we have multiple types implemented */}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Workflow</DescriptionListTerm>
        <DescriptionListDescription>
          {props.workflowLink ? (
            <Button
              variant="link"
              isInline
              onClick={() => props.onWorkflowClick(props.workflowLink!)}
              style={{ paddingLeft: 0 }}
            >
              {props.workflowName}
            </Button>
          ) : (
            props.workflowName
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Approval initiated</DescriptionListTerm>
        <DescriptionListDescription>{props.approvalInitiated}</DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )
}

// eslint-disable-next-line complexity
export default function ApprovalDetail() {
  const { approvalId } = useParams<{ approvalId: string }>()
  const [, setLocation] = useLocation()
  const { showAlert } = useAlerts()

  const approvalQuery = approvalsClient.useQuery('get', '/approvals/{approval_id}', {
    params: {
      path: {
        approval_id: approvalId || '',
      },
    },
    enabled: !!approvalId,
  })

  const queryState = useQueryState(approvalQuery, {
    title: 'Error loading approval',
    onRetry: () => detachPromise(approvalQuery.refetch()),
  })

  const approval = approvalQuery.data

  const [pendingDecision, setPendingDecision] = useState<'approved' | 'rejected' | undefined>(undefined)
  const [pendingReason, setPendingReason] = useState('')

  // Guard against missing approvalId
  if (!approvalId) {
    return (
      <AppPage>
        <AppPageHeader title="Error" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>
            <ErrorState title="Invalid approval" message="No approval ID provided" />
          </AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  // Show query state (loading/error)
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Approval details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  const approvalName = approval?.name || approval?.id || approvalId || 'Approval'
  const approvalStatus = approval?.status ?? 'pending'
  const isPending = approvalStatus === 'pending'
  const wfCtx = approval?.workflow_context as { workflow_name?: string; workflow_version_id?: string } | undefined
  const workflowName = wfCtx?.workflow_name || 'Workflow'
  const workflowId = wfCtx?.workflow_version_id
  const workflowLink = workflowId ? AppRoute.WorkflowBuilder.Edit.replace(':workflowId', workflowId) : undefined
  const createdAt = approval ? getDateField(approval as Record<string, unknown>, 'createdAt') : null
  const approvalInitiated = formatDateTime(createdAt)
  const decisionNotes = approval?.decision_notes ?? undefined
  const notesLabel = getNotesLabel(approvalStatus)
  const canSubmit = isPending && Boolean(pendingDecision && pendingReason.trim())
  const decisionCopy = pendingDecision ? getDecisionCopy(pendingDecision) : undefined

  const handleSubmit = () => {
    showAlert({
      title: pendingDecision === 'approved' ? 'Approval submitted' : 'Rejection submitted',
      description: `Unfortunately, this isn't yet implemented.`,
      variant: 'success',
      autoDismiss: true,
    })
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
      return (
        <ActionList>
          <ActionListItem>
            <Button icon={<RhUiLikeIcon />} variant="secondary" onClick={() => setPendingDecision('approved')}>
              Approve
            </Button>
          </ActionListItem>
          <ActionListItem>
            <Button
              icon={<RhUiDislikeIcon />}
              variant="secondary"
              isDanger
              onClick={() => setPendingDecision('rejected')}
            >
              Reject
            </Button>
          </ActionListItem>
        </ActionList>
      )
    }

    return (
      <Stack hasGutter>
        <Split hasGutter>
          <ApprovalStatusBadges status={pendingDecision} />
          <Button icon={<RhUiBackwardsIcon />} variant="plain" isInline onClick={() => setPendingDecision(undefined)} />
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
    <AppPage>
      <AppPageHeader title={approvalName}>
        <Button variant="secondary" onClick={() => setLocation(AppRoute.Approvals.Root)}>
          {isPending ? 'Cancel' : 'Back to Approvals'}
        </Button>
        {isPending && (
          <Button isDisabled={!canSubmit} onClick={handleSubmit}>
            Submit
          </Button>
        )}
      </AppPageHeader>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <AppPanel isFullHeight>
          <Stack hasGutter>
            {approval && (
              <>
                <StackItem isFilled>
                  <ApprovalSummaryList
                    workflowLink={workflowLink}
                    workflowName={workflowName}
                    approvalInitiated={approvalInitiated}
                    onWorkflowClick={setLocation}
                  />
                </StackItem>
                <StackItem isFilled style={{ minHeight: 0 }}>
                  <CodeBlock jsonObject={approval} enableCopy fillHeight />
                </StackItem>
                <StackItem>{renderDecisionActions()}</StackItem>
              </>
            )}
          </Stack>
        </AppPanel>
      </StackItem>
    </AppPage>
  )
}
