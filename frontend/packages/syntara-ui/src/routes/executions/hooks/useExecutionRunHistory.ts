import { useMemo } from 'react'

import { executionsClient } from '../../../client'
import { useCursorPagination } from '../../../hooks/useCursorPagination'

/** Cursor pagination, sort, and list query for the Run History panel on execution detail. */
export function useExecutionRunHistory(workflowId: string | undefined) {
  const executionExtraParams = useMemo(() => ({ workflow_id: workflowId ?? '' }), [workflowId])

  const {
    filters: executionFilters,
    queryParams: executionsQueryParams,
    handleFilterChange: handleExecutionFilterChange,
    getFooterProps: getExecutionPaginationFooterProps,
  } = useCursorPagination({
    limit: 20,
    extraParams: executionExtraParams,
    defaultSort: { field: 'created_at', direction: 'desc' as const },
  })

  const executionsQuery = executionsClient.useQuery(
    'get',
    '/executions',
    {
      params: { query: executionsQueryParams },
    },
    {
      enabled: !!workflowId,
    }
  )

  const executionPaginationFooterProps = useMemo(
    () => getExecutionPaginationFooterProps(executionsQuery.data),
    [getExecutionPaginationFooterProps, executionsQuery.data]
  )

  return {
    executionFilters,
    handleExecutionFilterChange,
    executionsQuery,
    executionPaginationFooterProps,
  }
}
