import type { WorkflowWithVersion } from '@ansible/nexus-contracts'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import { useParams, useSearch } from 'wouter'

import { executionsClient, workflowClient } from '../../client'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxErrorState } from '../../components/states/NxErrorState'
import { NxLoadingState } from '../../components/states/NxLoadingState'

import { BuilderContent } from './BuilderContent'
import type { ExecutionCopyData } from './hooks/useExecutionCopyToEditor'

export default function BuilderEdit() {
  const params = useParams<{ workflowId: string }>()
  const workflowId = params.workflowId
  const searchParams = useSearch()
  const parsedParams = useMemo(() => {
    const p = new URLSearchParams(searchParams)
    return { fromExecution: p.get('fromExecution'), linkExecution: p.get('linkExecution') }
  }, [searchParams])
  const executionIdParam = parsedParams.fromExecution ?? parsedParams.linkExecution

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

  const executionQuery = executionsClient.useQuery(
    'get',
    '/executions/{execution_id}',
    {
      params: {
        path: { execution_id: executionIdParam ?? '' },
        query: { include: 'workflow_definition' },
      },
    },
    { enabled: !!executionIdParam }
  )

  const executionCopy = useMemo((): ExecutionCopyData | undefined => {
    if (!executionIdParam || !executionQuery.data) return undefined
    const exec = executionQuery.data
    const wfDef = exec.workflow_definition as Record<string, unknown> | undefined
    if (!wfDef) return undefined
    return {
      executionId: executionIdParam,
      workflowDefinition: wfDef,
      preserveWorkflow: !!parsedParams.linkExecution,
    }
  }, [executionIdParam, executionQuery.data, parsedParams.linkExecution])

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
      <BuilderContent
        workflow={workflowQuery.data as WorkflowWithVersion}
        isNew={false}
        workflowId={workflowId}
        executionCopy={executionCopy}
      />
    </ReactFlowProvider>
  )
}
