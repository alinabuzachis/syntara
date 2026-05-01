import { useMemo } from 'react'

import { executionsClient, workflowClient } from '../../../client'
import type { FilterConfig } from '../../../types/filters'
import { buildFilterParams } from '../../../utils/filterUtils'
import { WORKFLOWS_LIST_PARAMS_FOR_DEFAULT_NAME } from '../utils/workflowListQuery'

export function useBuilderContentQueries(options: {
  workflowId: string | null
  isNew: boolean
  executionFilters: FilterConfig[]
  selectedExecutionId: string | null
  historyCardOpen: boolean
  mostRecentExecutionId: string | null
  mostRecentRunPanelOpen: boolean
}) {
  const {
    workflowId,
    isNew,
    executionFilters,
    selectedExecutionId,
    historyCardOpen,
    mostRecentExecutionId,
    mostRecentRunPanelOpen,
  } = options

  const executionsQueryParams = useMemo(() => {
    const params: Record<string, unknown> = { workflow_id: workflowId ?? '' }
    Object.assign(params, buildFilterParams(executionFilters))
    return params
  }, [workflowId, executionFilters])

  const executionsQuery = executionsClient.useQuery(
    'get',
    '/executions',
    {
      params: { query: executionsQueryParams },
    },
    {
      enabled: !!workflowId && !isNew,
      staleTime: 30000,
      gcTime: 300000,
    }
  )

  const selectedExecutionQuery = executionsClient.useQuery(
    'get',
    '/executions/{execution_id}',
    {
      params: {
        path: { execution_id: selectedExecutionId ?? '' },
        query: { include: 'activities' },
      },
    },
    { enabled: !!selectedExecutionId && historyCardOpen }
  )

  const mostRecentExecutionQuery = executionsClient.useQuery(
    'get',
    '/executions/{execution_id}',
    {
      params: {
        path: { execution_id: mostRecentExecutionId ?? '' },
        query: { include: 'activities' },
      },
    },
    { enabled: !!mostRecentExecutionId && mostRecentRunPanelOpen }
  )

  const workflowsListQuery = workflowClient.useQuery('get', '/workflows', WORKFLOWS_LIST_PARAMS_FOR_DEFAULT_NAME, {
    enabled: isNew,
  })

  return { executionsQuery, selectedExecutionQuery, mostRecentExecutionQuery, workflowsListQuery }
}
