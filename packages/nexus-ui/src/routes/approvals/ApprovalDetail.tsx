import {
  ActionList,
  ActionListItem,
  Button,
  CompassPanel,
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
import { workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { CodeBlock } from '../../components/details/CodeBlock'
import { ErrorState } from '../../components/states/ErrorState'
import { useQueryState } from '../../components/states/useQueryState'

import { ApprovalStatusBadges } from './approvalUtils'
import { mockApprovals } from './mockApprovals'

// Feature flag: Set to false when backend endpoints are ready
// Check at runtime to allow testing
const getUseMockApprovals = () => import.meta.env.VITE_USE_MOCK_APPROVALS !== 'false'

const formatDateTime = (dateString?: string | null) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
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

function ApprovalSummaryList(props: {
  automationLink?: string
  automationName: string
  approvalInitiated: string
  onAutomationClick: (link: string) => void
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
        <DescriptionListTerm>Automation</DescriptionListTerm>
        <DescriptionListDescription>
          {props.automationLink ? (
            <Button
              variant="link"
              isInline
              onClick={() => props.onAutomationClick(props.automationLink!)}
              style={{ paddingLeft: 0 }}
            >
              {props.automationName}
            </Button>
          ) : (
            props.automationName
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

export default function ApprovalDetail() {
  const USE_MOCK_APPROVALS = getUseMockApprovals()
  const { approvalId } = useParams<{ approvalId: string }>()
  const [, setLocation] = useLocation()
  const { showAlert } = useAlerts()

  const approvalQuery = workflowClient.useQuery('get', '/approvals/{approvalId}', {
    params: {
      path: {
        approvalId: approvalId,
      },
    },
    enabled: !USE_MOCK_APPROVALS && !!approvalId, // Only query API if not using mock data and approvalId exists
  })

  const queryState = useQueryState(approvalQuery, 'Error loading approval')

  // Use mock data if enabled, otherwise use API data
  const approval = USE_MOCK_APPROVALS ? mockApprovals.find((a) => a.id === approvalId) : approvalQuery.data

  const [pendingDecision, setPendingDecision] = useState<'approved' | 'rejected' | undefined>(undefined)
  const [pendingReason, setPendingReason] = useState('')

  // Guard against missing approvalId when not using mocks
  if (!approvalId && !USE_MOCK_APPROVALS) {
    return (
      <AppPage>
        <AppPageHeader title="Error" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <ErrorState title="Invalid approval" message="No approval ID provided" />
          </CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  // Only show query state (loading/error) if using real API
  if (!USE_MOCK_APPROVALS && queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Approval details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  const approvalName = approval?.name || approval?.id || approvalId || 'Approval'
  const approvalStatus = approval?.status || 'pending'
  const isPending = approvalStatus === 'pending'
  const automationName = approval?.workflow_context?.workflow_name || 'Automation'
  const automationId = approval?.workflow_context?.workflow_version_id
  const automationLink = automationId ? AppRoute.AutomationBuilder.Edit.replace(':workflowId', automationId) : undefined
  const createdAt = approval?.createdAt
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
            value={pendingReason}
            onChange={(_e, value: string) => setPendingReason(value)}
            placeholder={`Explain the reason for ${decisionCopy?.verb ?? 'updating'} this automation step.`}
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
        <CompassPanel isFullHeight>
          <Stack hasGutter>
            {approval && (
              <>
                <StackItem isFilled>
                  <ApprovalSummaryList
                    automationLink={automationLink}
                    automationName={automationName}
                    approvalInitiated={approvalInitiated}
                    onAutomationClick={setLocation}
                  />
                </StackItem>
                <StackItem isFilled style={{ minHeight: 0 }}>
                  <CodeBlock jsonObject={approval} enableCopy fillHeight />
                </StackItem>
                <StackItem>{renderDecisionActions()}</StackItem>
              </>
            )}
          </Stack>
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
