import type { WorkflowWithVersion } from '@ansible/nexus-contracts'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useParams } from 'wouter'

import { workflowClient } from '../../client'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxErrorState } from '../../components/states/NxErrorState'
import { NxLoadingState } from '../../components/states/NxLoadingState'

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
      <NxPage>
        <NxPageHeader title="Error loading workflow" />
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxErrorState title="Error loading workflow" message={error} />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  // Use isLoading instead of isPending to distinguish initial load from refetch
  // isLoading = true only on first fetch, isPending = true on both initial and refetch
  if (isLoading) {
    return (
      <NxPage>
        <NxPageHeader title="Loading workflow" />
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxLoadingState />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  return (
    <ReactFlowProvider key={workflowId}>
      <BuilderContent workflow={workflowQuery.data as WorkflowWithVersion} isNew={false} workflowId={workflowId} />
    </ReactFlowProvider>
  )
}
