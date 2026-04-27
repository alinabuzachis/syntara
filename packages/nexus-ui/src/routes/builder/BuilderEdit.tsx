import type { WorkflowWithVersion } from '@ansible/nexus-contracts'
import { StackItem } from '@patternfly/react-core'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useParams } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { AppPanel } from '../../components/AppPanel'
import { ErrorState } from '../../components/states/ErrorState'
import { LoadingState } from '../../components/states/LoadingState'

import { BuilderContent } from './BuilderContent'

export default function BuilderEdit() {
  const params = useParams<{ workflowId: string }>()
  const workflowId = params.workflowId

  // Fetch existing workflow - always refetch on mount to ensure fresh data
  const workflowQuery = workflowClient.useQuery(
    'get',
    '/workflows/{workflow_id}',
    {
      params: { path: { workflow_id: workflowId ?? '' } },
    },
    {
      enabled: !!workflowId,
      refetchOnMount: 'always',
    }
  )

  // Show loading/error states only on initial load, not during refetch
  // This prevents unmounting the component (and losing ButtonEdges) when refetching after save
  const { error, isLoading } = workflowQuery

  if (error) {
    return (
      <AppPage>
        <AppPageHeader title="Error loading workflow" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>
            <ErrorState title="Error loading workflow" message={error} />
          </AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  // Use isLoading instead of isPending to distinguish initial load from refetch
  // isLoading = true only on first fetch, isPending = true on both initial and refetch
  if (isLoading) {
    return (
      <AppPage>
        <AppPageHeader title="Loading workflow" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>
            <LoadingState />
          </AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <ReactFlowProvider key={workflowId}>
      <BuilderContent workflow={workflowQuery.data as WorkflowWithVersion} isNew={false} workflowId={workflowId} />
    </ReactFlowProvider>
  )
}
