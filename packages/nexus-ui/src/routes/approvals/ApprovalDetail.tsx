import { CompassPanel, Stack, StackItem } from '@patternfly/react-core'
import { useParams } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { CodeBlock } from '../../components/details/CodeBlock'
import { useQueryState } from '../../components/states/useQueryState'

import { mockApprovals } from './mockApprovals'

// Feature flag: Set to false when backend endpoints are ready
// Check at runtime to allow testing
const getUseMockApprovals = () => import.meta.env.VITE_USE_MOCK_APPROVALS !== 'false'

export default function ApprovalDetail() {
  const USE_MOCK_APPROVALS = getUseMockApprovals()
  const { approvalId } = useParams<{ approvalId: string }>()

  const approvalQuery = workflowClient.useQuery('get', '/approvals/{approvalId}', {
    params: {
      path: {
        approvalId: approvalId!,
      },
    },
    enabled: !USE_MOCK_APPROVALS, // Only query API if not using mock data
  })

  const queryState = useQueryState(approvalQuery, 'Error loading approval')

  // Use mock data if enabled, otherwise use API data
  const approval = USE_MOCK_APPROVALS ? mockApprovals.find((a) => a.id === approvalId) : approvalQuery.data

  // Only show query state (loading/error) if using real API
  if (!USE_MOCK_APPROVALS && queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Approval Details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  const approvalWithFields = approval as unknown as {
    name?: string
    description?: string | null
    workflow_context?: {
      workflow_version_id?: string
      workflow_name?: string
      inputs?: Record<string, unknown>
      previous_step?: {
        id?: string
        name?: string
        type?: string
        output?: Record<string, unknown> | null
      }
    }
    next_step_approved?: {
      id?: string
      name?: string
      type?: string
      description?: string | null
    } | null
    next_step_rejected?: {
      id?: string
      name?: string
      type?: string
      description?: string | null
    } | null
    decided_by?: { id: string; name: string } | null
    decided_at?: string | null
    decision_notes?: string | null
  }
  const approvalName = approvalWithFields?.name || approval?.id || approvalId || 'Approval'

  return (
    <AppPage>
      <AppPageHeader title={approvalName} />
      <StackItem isFilled>
        <CompassPanel isFullHeight>
          <Stack hasGutter>
            <StackItem>Approval detail page placeholder</StackItem>
            <StackItem>Approval ID: {approvalId}</StackItem>
            {approval && (
              <StackItem isFilled>
                <CodeBlock jsonObject={approval} noMaxHeight />
              </StackItem>
            )}
          </Stack>
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
