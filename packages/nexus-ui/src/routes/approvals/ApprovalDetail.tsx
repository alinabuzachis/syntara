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

import { AppPage, AppPageMain } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { AppRoute } from '../../app/AppRoute'
import { breadcrumbsApprovalDetail, breadcrumbsApprovalsPage } from '../../app/breadcrumbBuilders'
import { approvalsClient } from '../../client'
import { AppPanel } from '../../components/AppPanel'
import { CodeBlock } from '../../components/details/CodeBlock'
import { ErrorState } from '../../components/states/ErrorState'
import { useQueryState } from '../../components/states/useQueryState'
import { useMutationErrorHandler } from '../../hooks/useMutationErrorHandler'
import { useAlerts } from '../../providers/alerts'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'

import { ApprovalSummaryList } from './ApprovalSummaryList'
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

  const decisionMutation = approvalsClient.useMutation('patch', '/approvals/{approval_id}')
  const handleError = useMutationErrorHandler()

  const [pendingDecision, setPendingDecision] = useState<'approved' | 'rejected' | undefined>(undefined)
  const [pendingReason, setPendingReason] = useState('')

  // Guard against missing approvalId
  if (!approvalId) {
    return (
      <AppPage>
        <AppPageHeader title="Error" breadcrumbs={breadcrumbsApprovalsPage('Error')} />
        <AppPageMain>
          <AppPanel isFullHeight>
            <ErrorState title="Invalid approval" message="No approval ID provided" />
          </AppPanel>
        </AppPageMain>
      </AppPage>
    )
  }

  // Show query state (loading/error)
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Approval details" />
        <AppPageMain>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </AppPageMain>
      </AppPage>
    )
  }

  const approvalName = approval?.name || approval?.id || approvalId || 'Approval'
  const approvalStatus = approval?.status ?? 'pending'
  const isPending = approvalStatus === 'pending'
  const workflowName = approval?.workflow_context?.workflow_name || 'Workflow'
  const workflowId = approval?.workflow_context?.workflow_version_id
  const workflowLink = workflowId ? AppRoute.WorkflowBuilder.Edit.replace(':workflowId', workflowId) : undefined
  const createdAt = approval?.created_at ?? null
  const approvalInitiated = formatDateTime(createdAt)
  const decisionNotes = approval?.decision_notes ?? undefined
  const notesLabel = getNotesLabel(approvalStatus)
  const isSubmitting = decisionMutation.isPending || (decisionMutation.isSuccess && approvalQuery.isFetching)
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
          showAlert({
            title: pendingDecision === 'approved' ? 'Approval submitted' : 'Rejection submitted',
            description: `The approval decision has been recorded.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(
            approvalQuery.refetch().then(() => {
              setPendingDecision(undefined)
              setPendingReason('')
            })
          )
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
      return (
        <ActionList>
          <ActionListItem>
            <Button
              icon={<RhUiLikeIcon />}
              variant="secondary"
              isDisabled={isSubmitting}
              onClick={() => setPendingDecision('approved')}
            >
              Approve
            </Button>
          </ActionListItem>
          <ActionListItem>
            <Button
              icon={<RhUiDislikeIcon />}
              variant="secondary"
              isDanger
              isDisabled={isSubmitting}
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
          <Button
            icon={<RhUiBackwardsIcon />}
            variant="plain"
            isInline
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
    <AppPage>
      <AppPageHeader title={approvalName} breadcrumbs={breadcrumbsApprovalDetail(approvalName)}>
        <Button variant="secondary" onClick={() => setLocation(AppRoute.Approvals.Root)}>
          {isPending ? 'Cancel' : 'Back to Approvals'}
        </Button>
        {isPending && (
          <Button isDisabled={!canSubmit} isLoading={isSubmitting} onClick={handleSubmit}>
            Submit
          </Button>
        )}
      </AppPageHeader>
      <AppPageMain>
        <AppPanel isFullHeight>
          <Stack hasGutter>
            {approval && (
              <>
                <StackItem>
                  <ApprovalSummaryList
                    workflowLink={workflowLink}
                    workflowName={workflowName}
                    approvalInitiated={approvalInitiated}
                    onWorkflowClick={setLocation}
                  />
                </StackItem>
                <StackItem isFilled style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <CodeBlock jsonObject={approval} enableCopy fillHeight />
                </StackItem>
                <StackItem>{renderDecisionActions()}</StackItem>
              </>
            )}
          </Stack>
        </AppPanel>
      </AppPageMain>
    </AppPage>
  )
}
