import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useParams } from 'wouter'
import { workflowClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'
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

  const queryState = useQueryState(workflowQuery, 'Error loading workflow')
  if (queryState) return queryState

  return (
    <ReactFlowProvider key={workflowId}>
      <BuilderContent workflow={workflowQuery.data} isNew={false} workflowId={workflowId} />
    </ReactFlowProvider>
  )
}
