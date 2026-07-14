import { useMemo } from 'react'

import { executionsClient, workflowClient } from '../../../client'
import type { FilterConfig } from '../../../types/filters'
import { buildFilterParams } from '../../../utils/filterUtils'
import { WORKFLOWS_LIST_PARAMS_FOR_DEFAULT_NAME } from '../utils/workflowListQuery'

export function useBuilderContentQueries(options: {
  workflowId: string | null
  isNew: boolean
  executionFilters: FilterConfig[]
  mostRecentExecutionId: string | null
  mostRecentRunPanelOpen: boolean
  executionsCursor: string | null
  executionsPerPage: number
}) {
  const {
    workflowId,
    isNew,
    executionFilters,
    mostRecentExecutionId,
    mostRecentRunPanelOpen,
    executionsCursor,
    executionsPerPage,
  } = options

  const executionsQueryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      workflow_id: workflowId ?? '',
      limit: executionsPerPage,
      include_total: true,
    }
    Object.assign(params, buildFilterParams(executionFilters))
    if (executionsCursor) {
      params.cursor = executionsCursor
    }
    return params
  }, [workflowId, executionFilters, executionsCursor, executionsPerPage])

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

  return { executionsQuery, mostRecentExecutionQuery, workflowsListQuery }
}
